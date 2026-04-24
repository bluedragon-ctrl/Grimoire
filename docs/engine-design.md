# Grimoire Engine Design

Short design note for the headless turn engine. Written before implementation; please confirm alignment before code lands.

## Layers

```
engine.runRoom({room, actors}) ──► EventLog (+ abort handle)
        │
        └── scheduler ── drives ticks, picks next actor, dispatches events
                │
                └── interpreter (generator per actor)
                        │
                        └── commands / queries (pure against World)
```

One file per layer. World state (room + actor list + tick counter + log) is a single mutable object passed down; layers don't reach outside it.

## Actor as generator

Each actor's script compiles to a generator `function*` produced by the interpreter. The generator:

- **yields** a `PendingAction` descriptor `{ kind, cost, args }` when it reaches a command call (`approach(x)`, `attack(y)`, …).
- **returns** when the script runs out (or hits `halt()` / `exit()` — both yield a terminal pending action, then the generator completes).

Expressions are evaluated synchronously inside the interpreter — no yields for queries, binops, member access, etc. Control flow (`if`, `while`, `for`) is just generator control flow: the generator loops internally and yields the next `PendingAction` when it hits one. No CPS, no trampoline.

Per actor the scheduler keeps:

```
{ actor, mainGen, activeGen, pending, eventQueue }
```

`activeGen` is normally `mainGen`; during a handler it's the handler generator with `mainGen` suspended underneath. `pending` is the currently-yielded action waiting to fire.

## Scheduler (NetHack-style energy)

```
loop:
  if aborted: flush + return
  tick += 1
  for actor in living(actors): actor.energy += actor.speed
  loop:
    ready = actors where pending exists and energy >= pending.cost
    if empty: break inner         # nothing more firing this tick
    sort ready by (-energy, id)
    pick first, fire it, energy -= pending.cost, pending = null
    advance its activeGen to next pending (or mark idle/dead)
  if no actor has a pending action and no living actor will ever act again:
    terminate                       # pure idle room — done
```

Notes:
- An actor can act multiple times in one tick if it accumulated enough energy over prior idle ticks (standard NetHack behaviour).
- "Nothing more firing this tick" exits the inner loop so energy accumulation is monotonic across ticks — we never mix a later tick's energy into this one's ordering.
- Advancing the generator happens immediately after firing, so by the top of the next iteration every live actor has a fresh `pending` (or is idle/halted/dead).
- Tiebreak: descending energy, ascending `id` — deterministic.
- A terminated main generator with no handlers queued → actor idles forever. The scheduler still ticks energy for them (cheap, keeps logic uniform) but they never show up in `ready`.

## Effects and stat resolution (Phase 5)

An effect is a uniform `{ id, kind, target, magnitude?, duration, remaining, tickEvery, source? }` record attached to an actor. Four kinds ship in Phase 5: `burning` (DoT), `regen` (HoT), `haste` (speed ×1.5), `slow` (speed ×0.5). All spells, item procs, clouds, weapon on-hit, and statuses will sit on this abstraction — the engine only knows about the four verbs `apply`, `onApply`, `onTick`, `onExpire`.

**Stacking.** Same kind on the same target from any source → refresh `remaining` to `max(existing, new)`; magnitude does not stack. Different kinds stack independently. `haste + slow` coexist, yielding effective `floor(base * 1.5 * 0.5) = floor(base * 0.75)`, clamped to min 1.

**Tick ordering per scheduler tick.**

```
on tick T → T+1 transition:
  world.tick += 1
  onTick user callback
  energy += effectiveStats(actor).speed    # uses modified speed
  for each actor: tickEffects(actor)       # effect phase — AFTER prior tick's actions
    for each effect on actor:
      if finite duration: remaining -= 1
      elapsed = duration - remaining    (or monotonic counter for permanent)
      if spec.onTick and elapsed % tickEvery == 0: fire onTick
      if finite and remaining <= 0: onExpire + remove
  dispatch effect events (log + handler routing)
  ensurePending
  back to top: ready actions fire
```

Placing the effect phase AFTER the prior tick's actions (i.e., at tick-transition, before new actions for the upcoming tick) keeps the rule "actions first, statuses resolve after" consistent — a burning actor who just struck and killed an enemy still ticks the burn.

**Stat resolution.** `effectiveStats(actor)` is a pure fold over `actor.effects` returning `{ hp, maxHp, speed, atk, def, mp, maxMp, int }`. Modifier effects (haste/slow) are read-only on base stats — no mutation. Damage and healing still mutate `hp` directly — they're not modifiers, they're direct changes.

**Reserved formula (Phase 6).** Spell effects will scale magnitude by `floor(base * (1 + int / 10))`. Phase 5 adds the `int` stat (hero default 5, goblin 0) but no mechanic reads it yet — the contract is reserved so Phase 6 inherits it.

**Design choice: regen at full HP skips the tick** — no `EffectTick` event when nothing healed. Rationale: consumers observe ticks as "something happened"; emitting a magnitude-0 event is noise.

## Commands and action resolution

Commands live in `commands.ts`, each a pure `(world, actor, args) → { ok, damage?, log, ... }`. The scheduler calls them when firing a pending action and translates the result into events.

Target resolution goes through a single seam:

```ts
type ResolveFailureMode = "silent" | "throw" | "cancel";   // future
const failureMode: ResolveFailureMode = "silent";          // MVP

function resolveTarget(world, actor, ref): Actor | Tile | null
```

MVP: returns `null` on failure, command emits `ActionFailed { reason }`, action still consumes its cost (so a bad script can't starve the scheduler). Swapping to `"throw"` later means raising inside `resolveTarget` and letting the interpreter surface it as a runtime error event; `"cancel"` means returning a sentinel the scheduler treats as a no-cost retry. One file, one function — future swap is a line change.

Queries (`enemies()`, `items()`, `doors()`, `hp()`, `me`) are zero-cost: they run inline during expression eval, return arrays sorted by Manhattan distance from `actor.pos`. They never consume energy and never yield.

## Events and handler preemption

Events are emitted by commands (attack → `hit` on defender) and by the scheduler (`Died`, `HeroExited`, `HeroDied`, `ActionFailed`). Two audiences:

1. **Log** — every event is appended to the `EventLog` unconditionally.
2. **Actor handlers** — if the target actor has a handler for that event name, dispatch.

Dispatch rules:

- Handler lookup is keyed by event name; binding (`on hit as attacker`) is passed as a local in the handler's generator scope.
- Dispatch itself costs 0 energy. The handler generator runs; actions inside cost normally.
- If an actor is already running a handler when another event arrives, queue it. One handler at a time per actor.
- When a handler's generator returns, pop it: resume the suspended generator underneath (main or a prior handler). Drain the queue before yielding control back to the scheduler's "advance generator" step.
- Main script does not observe events directly — handlers are the only interface. Keeps the main/handler boundary clean.

Events wired in MVP: `hit` (emitted, handlers dispatched). `see` has plumbing (event type, dispatch path) but nothing emits it yet — parser / vision system will.

## Termination conditions

- `halt()` — main generator returns cleanly, actor idles (handlers still fire).
- `exit(door)` on correct tile — emits `HeroExited`, scheduler ends the room.
- Hero HP ≤ 0 — emits `HeroDied`, scheduler stops, log flushed.
- `engine.abort()` — external flag checked at top of each tick; flushes log and returns.
- All actors dead/halted and no hero — room just ends (nothing left to simulate).

## AST generality

Interpreter handles the full statement/expression set listed in the spec from day one. MVP demo ASTs only exercise a subset (calls, if, while, simple assigns, handlers), but the evaluator doesn't know that — when the parser lands, no interpreter changes needed.

AST factories (`ast-helpers.ts`) give tests and the demo a readable way to build trees without parser syntax.

## File layout

```
src/
  types.ts         AST nodes, World, Actor, Event, PendingAction, Command
  ast-helpers.ts   node constructors: lit(), ident(), call(), while_(), etc.
  commands.ts      command impls + queries + resolveTarget
  interpreter.ts   compile(ast) → generator factory; expr eval; handler gen
  scheduler.ts    runLoop(world) — energy, dispatch, events, abort
  engine.ts        runRoom({room, actors}) public API; owns abort signal
  demo.ts          hardcoded room + hero/goblin ASTs for the UI Run button
  ui/
    main.ts        wires Run/Stop to engine, streams log
    layout.css     grid layout
index.html
tests/             vitest specs (one per scenario in the brief)
```

## Phase 6: data-driven spells + clouds

### Spell validation order (castSpell)

`castSpell(world, caster, name, target)` runs six checks in order; the first
failure short-circuits with a single `ActionFailed` event. **No mana is
deducted on failure, and no primitives run.** The scheduler additionally
refunds the cast's energy cost when the result is only `ActionFailed` — so
failed casts don't consume the actor's action slot.

1. **Known spell?** — `SPELLS[name]` must exist. Suggests nearest via
   `didYouMean`: `"Unknown spell 'bolr'. Did you mean 'bolt'?"`.
2. **Caster learned it?** — `caster.knownSpells` must include the name.
3. **Target type valid?** — `"self"` resolves to caster; `"tile"` accepts
   either a position or an actor (actor → actor.pos); `"ally"` requires same
   faction and alive; `"enemy"` requires opposing faction and alive; `"any"`
   requires any live actor.
4. **In range?** — Chebyshev distance ≤ `spell.range`.
5. **Sufficient mana?** — `caster.mp >= spell.mpCost`.
6. **All clear** — deduct `mpCost`, emit `Cast`, then run each `body` op
   through the primitive registry in order.

### Primitive registry

Spell bodies are declarative `SpellOp[]`. Each op names a primitive and a
plain args bag. Phase 6 ships four implemented primitives (`project`,
`inflict`, `heal`, `spawn_cloud`) and four stubs (`explode`, `summon`,
`teleport`, `push`). Stubs are callable — they emit an
`ActionFailed { reason: "Primitive 'X' is not implemented yet" }` and, for
`explode`, a `VisualBurst` so later renderers can still hook the effect
site. Nothing throws.

Primitives may accept `visual?: string` and `element?: string` args. These
pass through unchanged onto emitted events (`Cast.visual`,
`CloudSpawned.visual`, `VisualBurst.visual`). The engine never reads them —
the Phase 8 renderer will resolve preset names against
`src/content/visuals.ts`.

INT-based magnitude scaling lives in a single function, `scale(base, int)`
in `src/content/scaling.ts`. Primitives apply it to damage, heal amounts,
and effect durations; never to range or mpCost.

### Cloud lifecycle

`room.clouds` is a first-class map feature. Each cloud carries
`{ id, pos, kind, duration, remaining, source? }`. The cloud's `kind` names
an entry in `CLOUD_KINDS` (content), which specifies the effect re-applied
to any actor on the tile.

Each scheduler tick, `tickClouds(world)` runs **after `tickEffects` and
before the next actor action slot**:

1. For each cloud, find live actors whose position matches the cloud's
   position, and call `applyEffect` with the configured effect. Phase 5
   stacking semantics (refresh duration to max; magnitude doesn't stack)
   handle repeat ticks and re-entry.
2. Emit `CloudTicked { id, appliedTo }` if at least one actor was hit.
3. Decrement `remaining`; at ≤ 0 emit `CloudExpired` and splice out.

Multiple clouds on the same tile tick independently and all apply. Clouds
do **not** block movement in Phase 6.

### Tick order

Within a scheduler tick, when no action is ready and time advances:

1. `world.tick += 1`; `onTick` hook; actors accrue energy by
   `effectiveStats.speed`.
2. **Effects phase:** `tickEffects(world, actor)` for each live actor.
3. **Clouds phase:** `tickClouds(world)` — cloud applications + decays.
4. **Death-drop sweep (Phase 9):** any `Died` events emitted by the just-
   fired action or the effect/cloud phase are scanned; each victim's loot
   table rolls through `worldRandom()` and the resulting `ItemDropped`
   events are appended to the *same* bundle. Drops never span ticks.
5. Dispatch all phase events through handler routing.
6. Return to action-readiness check.

### Determinism (Phase 9)

A single mulberry32 state (`World.rngSeed`, seeded from `RunOptions.seed`,
default 1) drives every random decision — currently just loot rolls, but
Phase 10's AI and any future crit/miss rolls must draw from the same
generator so replaying `(setup, seed)` is byte-identical. `Math.random` is
never called inside `src/`.

## Open questions (flagging, not blocking)

- Do queries see a snapshot of world state at yield time, or live state each evaluation? **Proposed: live** — simpler, and scripts are single-threaded per actor so no race.
- Sort stability for queries with equal Manhattan distance? **Proposed: secondary key = actor id / tile (x,y) lex.**
- Does `ActionFailed` count as a fired action for cost purposes? **Proposed: yes** (as above — prevents starvation).

Will proceed with the "proposed" answers unless told otherwise.
