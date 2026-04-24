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

## Effects and stat resolution (Phase 5 + 13)

An effect is a uniform `{ id, kind, target, magnitude?, duration, remaining, tickEvery, source? }` record attached to an actor. The engine only knows about the four lifecycle verbs `apply`, `onApply`, `onTick`, `onExpire`, plus `onStack` (Phase 13) for effects that deviate from standard stacking.

**Thirteen kinds ship through Phase 13:**

| kind | behaviour | mechanism |
|---|---|---|
| `burning` | DoT — damage per tick | onTick mutates hp |
| `regen` | HoT — heal per tick | onTick mutates hp |
| `haste` | speed ×1.5 | effectiveStats multiplier |
| `slow` | speed ×0.5 | effectiveStats multiplier |
| `poison` | weaker / longer burn | onTick mutates hp |
| `chill` | speed and atk ×(1 − N%) | effectiveStats multiplier |
| `shock` | def −N flat | effectiveStats delta |
| `expose` | incoming physical damage ×(1 + N%) | resolved at doAttack |
| `might` | atk +N flat | effectiveStats delta |
| `iron_skin` | def +N flat | effectiveStats delta |
| `mana_regen` | mp +N per tick | onTick mutates mp |
| `mana_burn` | mp −N per tick | onTick mutates mp |
| `power` | int +N flat | effectiveStats delta |
| `shield` | damage-absorption pool (see below) | onApply/onExpire mutate shieldHp |

**Non-goals (defer to later phases):** `wards` (6 elemental wards — needs damage-type system first); damage-type tagging on spells/attacks.

**Stacking.** Same kind on the same target from any source → refresh `remaining` to `max(existing, new)`; magnitude does not stack (first-write-wins, keeps identity stable). Different kinds stack independently. `haste + slow` coexist, yielding effective `floor(base * 1.5 * 0.5) = floor(base * 0.75)`, clamped to min 1. `chill` composes with haste/slow as an additional speed multiplier.

**Shield stacking deviation.** `shield` is a pool, not a modifier. When re-applied while active: duration refreshes to max (standard), but if the incoming magnitude exceeds the existing magnitude the pool (`actor.shieldHp`) is topped up to the new magnitude and `existing.magnitude` is updated. Smaller incoming magnitude leaves the pool unchanged. This is implemented via `EffectSpec.onStack`.

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

**Stat resolution.** `effectiveStats(actor)` is a pure fold over `actor.effects` returning `{ hp, maxHp, speed, atk, def, mp, maxMp, int }`. Modifier effects are read-only — no mutation. Order: flat deltas (might, iron_skin, shock) are applied first, then multipliers (haste, slow, chill), so `chill` reduces the already-boosted atk. `expose` and `shield` are not stats — they are resolved at the damage-apply site in `doAttack`. Direct changes (damage, healing, mana drain) still mutate the actor fields directly.

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

Queries (`enemies()`, `items()`, `doors()`, `hp()`, `me`, `distance()`, `adjacent()`, `can_cast()`, …) are zero-cost: they run inline during expression eval, return arrays sorted by Manhattan distance from `actor.pos`. They never consume energy and never yield. The full set is catalogued in `dsl-queries.md`.

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
- Dispatch is symmetric across actors: handlers fire for any actor with a matching `on <event>` block — hero and monsters alike. `halt()` ends main but does not disable handlers; a halted actor keeps receiving events until it dies.

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
plain args bag. Phase 13.1 ships five implemented primitives (`project`,
`inflict`, `heal`, `spawn_cloud`, `explode`) and three stubs (`summon`,
`teleport`, `push`). Phase 13.2 fully implements `summon` (see §Phase 13.2
Summoning). Remaining stubs (`teleport`, `push`) are callable — they emit
`ActionFailed { reason: "Primitive 'X' is not implemented yet" }`. Nothing
throws.

Primitives may accept `visual?: string` and `element?: string` args. These
pass through unchanged onto emitted events (`Cast.visual`,
`CloudSpawned.visual`, `VisualBurst.visual`). The engine never reads them —
the renderer resolves preset names against `src/content/visuals.ts`.

**`explode` contract.** `targetType: "tile"`. Args: `{ radius, damage?,
kind?, duration?, magnitude?, visual?, element?, selfCenter? }`. Sweeps
every tile within Chebyshev `scaleRadius(radius, caster.int)` of the target
position; applies scaled damage + optional effect to every live actor found.
Wall filter: tiles outside room bounds are skipped (structural tile-map wall
checking is deferred to the dungeon-gen phase). `selfCenter: true` excludes
the caster even when they stand on the target tile — AoE self-cast spells
(frost_nova, thunderclap) never self-damage. Emits one `VisualBurst` at the
target position, then one `Hit`/`Died`/`EffectApplied` per actor struck.

### Scaling

INT-based scaling lives in `src/content/scaling.ts`:

```ts
scale(base, int)       = floor(base * (1 + int / 10))   // damage, duration, magnitude, heal
scaleRadius(base, int) = base + floor(int / 8)           // AoE radius only
```

**Fixed:** `range` and `mpCost` never scale — they are fixed per-spell
constants for UI predictability.

**Radius > range = placement risk.** A fireball with base radius 2 cast at
maximum range 4 is safe at int 0. At int 24 the radius grows to 5, which
reaches back to the caster's tile — taking them into the blast. This is
intentional: high-INT casters gain wider blasts in exchange for positional
discipline.

**Magnitude scaling in `inflict` and `explode`.** The scaled value enters
`applyEffect`; Phase-5 stacking rules (first-write-wins on magnitude,
duration refreshes to max) apply after. So a second `curse` cast on an
already-exposed target refreshes the timer but does not stack the magnitude.

### Spell catalog (Phase 13.1 — 20 spells)

**Single-target:**

| spell | target | range | mp | effects |
|---|---|---|---|---|
| `bolt` | enemy | 6 | 5 | arcane damage |
| `firebolt` | enemy | 6 | 8 | fire damage + burning |
| `frost_lance` | enemy | 6 | 7 | frost damage + chill |
| `shock_bolt` | enemy | 6 | 7 | lightning damage + shock |
| `venom_dart` | enemy | 6 | 6 | poison damage + poison |
| `curse` | enemy | 3 | 6 | expose (incoming dmg ↑) |
| `mana_leech` | enemy | 3 | 4 | mana_burn (mp drain) |

**AoE explosions (radius scales with int):**

| spell | target | range | mp | effects |
|---|---|---|---|---|
| `fireball` | tile | 4 | 12 | fire blast + burning, radius 2 |
| `frost_nova` | self | 0 | 11 | frost burst + chill, radius 2, self-safe |
| `thunderclap` | self | 0 | 10 | shock burst, radius 1, self-safe |
| `meteor` | tile | 5 | 18 | massive fire blast + burning, radius 3 |

**Clouds:**

| spell | target | range | mp | effects |
|---|---|---|---|---|
| `firewall` | tile | 4 | 10 | fire cloud (burning DoT) |
| `poison_cloud` | tile | 4 | 11 | poison cloud (poison DoT) |

**Buffs:**

| spell | target | range | mp | effects |
|---|---|---|---|---|
| `bless` | ally | 1 | 7 | haste |
| `might` | self | 0 | 6 | atk +N |
| `iron_skin` | self | 0 | 6 | def +N |
| `mind_spark` | self | 0 | 6 | int +N (power) |
| `focus` | self | 0 | 5 | mana regen |
| `shield` | self | 0 | 8 | damage-absorption pool |

**Heal:**

| spell | target | range | mp | effects |
|---|---|---|---|---|
| `heal` | ally | 1 | 5 | restore HP |

**Non-goals deferred to later phases:** scrolls and learn-from-scroll flow
(Phase 13.2/13.3), summoning primitives, `teleport`, `push`, ward/resist
system, damage-type defence interactions.

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

## Phase 13.2: Factions

### Faction field

Every actor carries an optional `faction?: "player" | "enemy" | "neutral"`. All engine code that reads faction falls back to `actor.isHero ? "player" : "enemy"` when the field is absent, preserving backward compat with hand-rolled test actors.

- **Hero** — always `faction: "player"` (set by `cloneActor`).
- **Wild monsters** — always `faction: "enemy"` (set by `createActor`).
- **Summoned actors** — inherit the summoner's faction (set at spawn).
- **Neutral** — infrastructure only this phase; no neutral content ships.

### `isHero` vs `faction` distinction

`isHero: true` marks the single protagonist whose death ends the run. `faction: "player"` marks the player side. A summoned goblin has `faction: "player"` but `isHero: false`. Death-ends-run logic keys off `isHero`; spell targeting, enemy/ally selectors, and faction checks key off `faction`.

### Selector contract

| selector | returns |
|---|---|
| `enemies(self)` | actors where `faction !== self.faction` AND NOT both neutral |
| `allies(self)` | actors where `faction === self.faction` AND NOT both neutral, excluding self |

Two neutrals are neither allies nor enemies — they ignore each other. All actor selectors use these helpers; no `isHero` comparisons in selector code paths.

## Phase 13.2: Summoning

### `summon` primitive

`summon` is a full spell primitive (and also a DSL command). Contract:

1. Resolve target tile; reject if out-of-bounds or occupied → `ActionFailed`.
2. Look up `MONSTERS[template]`; throw `DSLRuntimeError` if missing (caught by the scheduler and logged as `ScriptError`).
3. Cap check: `max(1, floor(caster.int / 4))` live summons per caster. Overflow → `ActionFailed` (pre-spend, MP already gated by cast path).
4. Clone template → new Actor: fresh id (`world.actorSeq++`), `pos = target tile`, `faction = caster.faction`, `owner = caster.id`, `summoned = true`, full hp/mp from template, `alive = true`.
5. Push into `world.actors`; scheduler's `syncNewActors` picks it up after the current step and creates a runtime.
6. Emit `Summoned` + `VisualBurst(summon_portal)`.

### DSL `summon()` command

Scripts may call `summon(template, tile)` directly (not via a spell). The energy cost is `COST.summon = 15`. The MP gate uses `template.summonMpCost` (deducted before spawn). Failed direct summons refund energy (same policy as failed casts).

### Cap formula

`max(1, floor(int / 4))`:

| int | cap |
|---|---|
| 0–7 | 1 |
| 8–11 | 2 |
| 12–15 | 3 |
| 16–19 | 4 |

Measured against live `world.actors` with `owner === caster.id`.

### Room-exit sweep

On `HeroExited`: every actor with `owner` set is immediately marked dead and a `Despawned { reason: "room_exit" }` event is emitted per actor. Despawned actors drop no loot (`summoned === true` skips `rollDeathDrops`).

### Summoner-death cascade

On any `Died` event: all live actors with `owner === deceased.id` are swept, marked dead, and each emits `Despawned { reason: "summoner_died" }`. Cascade repeats recursively so a summon that itself owns summons is fully unwound. The cascade is safe against cycles because each actor is marked dead before recursing.

### Summoned-no-loot rule

`appendDeathDrops` in the scheduler skips `rollDeathDrops` when `actor.summoned === true`. This applies to both sweep paths (room exit and summoner death).

### MONSTERS registry additions

| field | type | meaning |
|---|---|---|
| `summonable?` | `boolean` | Eligible for player-side summon spells |
| `summonMpCost?` | `number` | MP price when summoned via DSL or spell |

Load-time validation: every `summon_X` entry in SPELLS must reference a template with `summonable === true` and a defined `summonMpCost`. Fails loud at import.

## Phase 13.2: Seedable RNG and DSL builtins

`World.rngSeed` (already present from Phase 9) seeds a mulberry32 generator. Two new DSL builtins are exposed via the `queries` object:

| builtin | signature | semantics |
|---|---|---|
| `chance(p)` | `p: 0–100` | Returns `worldRandom(world) * 100 < p` |
| `random(n)` | `n: integer ≥ 0` | Returns `floor(worldRandom(world) * n)` |

Both advance `world.rngSeed`. Because the world seed is deterministic from `RunOptions.seed`, replaying `(setup, seed)` produces identical RNG sequences. `chance(0)` is always false; `chance(100)` is always true; `random(1)` always returns 0.

## Phase 13.2: Non-goals

- Monster script universalization (full rewrite for faction-aware selectors) — deferred to the monster-content phase.
- Neutral actors as content — infrastructure only.
- `teleport`, `push` primitives — still stubs.
- Consumables / scrolls — Phase 13.3.
- Summon visuals beyond portal / despawn puff — summons use their template's `MONSTER_VISUALS` entry unchanged.

## Open questions (flagging, not blocking)

- Do queries see a snapshot of world state at yield time, or live state each evaluation? **Proposed: live** — simpler, and scripts are single-threaded per actor so no race.
- Sort stability for queries with equal Manhattan distance? **Proposed: secondary key = actor id / tile (x,y) lex.**
- Does `ActionFailed` count as a fired action for cost purposes? **Proposed: yes** (as above — prevents starvation).

Will proceed with the "proposed" answers unless told otherwise.
