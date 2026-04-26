# Grimoire Engine Design

Reference for the headless turn engine: layers, scheduler, effects, commands, events, and the spell/item/summon/RNG mechanics layered on top.

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

## Effects and stat resolution

An effect is a uniform `{ id, kind, target, magnitude?, duration, remaining, tickEvery, source? }` record attached to an actor. The engine knows the four lifecycle verbs `apply`, `onApply`, `onTick`, `onExpire`, plus `onStack` for effects that deviate from standard stacking.

**Effect kinds:**

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

**Stat resolution.** `effectiveStats(actor)` is a pure fold over `actor.effects` returning `{ hp, maxHp, speed, atk, def, mp, maxMp, int }`. Modifier effects are read-only — no mutation. Order: flat deltas (might, iron_skin, shock) are applied first, then multipliers (haste, slow, chill), so `chill` reduces the already-boosted atk. `expose` and `shield` are not stats — they are resolved at the damage-apply site in `doAttack`. Equipment bonuses are folded in here too (additive across all equipped slots — see `items.md`). Direct changes (damage, healing, mana drain) still mutate the actor fields directly.

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

Queries (`enemies()`, `items()`, `doors()`, `me`, `at(...)`, …) are zero-cost: they run inline during expression eval, return Collections sorted by Chebyshev distance from `actor.pos`. They never consume energy and never yield. The full set is catalogued in `dsl-queries.md`.

The per-actor distance metric is Chebyshev (8-directional, matches `approach()` movement). Use the actor surface methods: `me.distance_to(other)`, `me.adjacent_to(other)`, `me.can_cast(spell, target?)`, `actor.has_effect("burning")`, `actor.list_effects()`. AoE shapes (`explode`, `frost_nova`) keep Euclidean math so radius-2 blasts read as rounded blobs rather than squares.

### Commands return bool

Command calls are expressions: `if attack(foe):` is legal and resolves to `true` when the action fires cleanly, `false` when an `ActionFailed` event is emitted in the resulting bundle. The scheduler resumes the actor's generator with the bool via the per-frame `lastResult` field on `Frame`. Statement-level command calls discard the bool and look identical to before.

Lambda bodies and expression-position user-function calls (`def f(x): return x*2; y = f(3)`) drive the expression generator synchronously and raise `DSLRuntimeError` if a command yield is encountered — matching Python's restriction that lambda bodies are expressions only.

### Pythonic collections, lambdas, def, control flow

- `enemies()`, `allies()`, `items()`, `objects()`, etc. return `Collection` (Pythonic list with `len()`, indexing, iteration, truthiness, `.filter(pred)`, `.sorted_by(key)`, `.first()`, `.last()`, `.min_by(key)`, `.max_by(key)`).
- Builtins: `len(coll)`, `min(coll, key?)`, `max(coll, key?)`.
- `lambda x: x.hp` returns a JS closure capturing the lexical Env. Expression-only body, no statements.
- `def name(params): body` registers a user function. Nested defs respect Python LEGB: each call gets a fresh `funcs` map so inner defs don't leak to callers.
- `break`, `continue`, `pass` work in `while` / `for`. Implemented via thrown sentinel signals caught at the loop frame.

### Event registry (parse-time validation)

Valid `on <event>:` names are listed in `src/lang/event-registry.ts`. The parser rejects unknown names with a `ParseError` plus a "did you mean `hit`?" suggestion — a typo like `on hti:` no longer silently never fires.

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

Valid handler names are listed in `src/lang/event-registry.ts`; the parser rejects unknown names at parse time.

## Termination conditions

- `halt()` — main generator returns cleanly, actor idles (handlers still fire).
- `exit(door)` on correct tile — emits `HeroExited`, scheduler ends the room.
- Hero HP ≤ 0 — emits `HeroDied`, scheduler stops, log flushed.
- `engine.abort()` — external flag checked at top of each tick; flushes log and returns.
- All actors dead/halted and no hero — room just ends (nothing left to simulate).

## AST generality

The interpreter handles the full statement/expression set. AST factories in `ast-helpers.ts` give tests a readable way to build trees without parser syntax; production code paths build trees by parsing DSL source via `src/lang/`.

## File layout

```
src/
  types.ts            AST nodes, World, Actor, Event, PendingAction, ItemDef, ...
  ast-helpers.ts      node constructors: lit(), ident(), call(), while_(), etc.
  engine.ts           runRoom({room, actors}) public API; owns abort signal
  scheduler.ts        runLoop(world) — energy, dispatch, events, abort
  interpreter.ts      compile(ast) → generator factory; expr eval; handler gen
  commands.ts         command impls + queries + resolveTarget
  effects.ts          effect registry, applyEffect, tickEffects, effectiveStats
  clouds.ts           cloud lifecycle and tick
  los.ts              Bresenham line-of-sight (smoke-aware)
  rng.ts              mulberry32, worldRandom
  persistence.ts      localStorage load/save, fresh run, inventory routing
  demo.ts             starter hero AST factory used by content/rooms
  config/             editor config (visuals)
  content/            data registries: items, monsters, spells, loot, clouds,
                      visuals, scaling, ai-archetypes, rooms
  dungeon/            archetypes, generator, dungeon-object types
  spells/             cast (validation pipeline) + primitives (op registry)
  items/              execute (use/equip/unequip/procs/aura), loot, legacy script
  lang/               tokenizer, parser, errors, event-registry, actor-surface,
                      collection, index (parse() entry point)
  render/             wire-adapter, mount, pure-pixel draws (context, prims,
                      items, effects, monsters, objects, tiles), vendor/ bundle
  ui/                 main, run-state, inventory, proc-format, help/ pane
index.html
tests/                vitest suites mirroring src/ structure
```

---

## Spells and clouds

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
plain args bag. Implemented primitives: `project`, `inflict`, `heal`,
`spawn_cloud`, `explode`, `summon`, `cleanse`, `permanent_boost`. Stubs
(`teleport`, `push`) are callable but emit `ActionFailed { reason:
"Primitive 'X' is not implemented yet" }` — nothing throws.

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

### Spell catalog

The full spell registry — names, target types, ranges, MP costs, scaling, and op bodies — lives in [`src/content/spells.ts`](../src/content/spells.ts). It groups into single-target damage, AoE explosions (`explode` op, INT-scaling radius), cloud-spawners, self/ally buffs, and `heal`. The in-game help pane (Prep screen) renders the same data with examples.

### Cloud lifecycle

`room.clouds` is a first-class map feature. Each cloud carries
`{ id, pos, kind, duration, remaining, source? }`. The cloud's `kind` names
an entry in `CLOUD_KINDS` (content), which specifies the effect re-applied
to any actor on the tile.

Each scheduler tick, `tickClouds(world)` runs **after `tickEffects` and
before the next actor action slot**:

1. For each cloud, find live actors whose position matches the cloud's
   position, and call `applyEffect` with the configured effect. Effect
   stacking semantics (refresh duration to max; magnitude doesn't stack)
   handle repeat ticks and re-entry.
2. Emit `CloudTicked { id, appliedTo }` if at least one actor was hit.
3. Decrement `remaining`; at ≤ 0 emit `CloudExpired` and splice out.

Multiple clouds on the same tile tick independently and all apply. Clouds
do **not** block movement.

### Tick order

Within a scheduler tick, when no action is ready and time advances:

1. `world.tick += 1`; `onTick` hook; actors accrue energy by
   `effectiveStats.speed`.
2. **Effects phase:** `tickEffects(world, actor)` for each live actor.
3. **Clouds phase:** `tickClouds(world)` — cloud applications + decays.
4. **Death-drop sweep:** any `Died` events emitted by the just-fired action
   or the effect/cloud phase are scanned; each victim's loot table rolls
   through `worldRandom()` and the resulting `ItemDropped` events are
   appended to the *same* bundle. Drops never span ticks.
5. Dispatch all phase events through handler routing.
6. Return to action-readiness check.

### Determinism

A single mulberry32 state (`World.rngSeed`, seeded from `RunOptions.seed`,
default 1) drives every random decision — loot rolls, monster AI choices,
proc chance gates. Replaying `(setup, seed)` is byte-identical.
`Math.random` is never called inside `src/`.

---

## Factions

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

## Summoning

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

## Seedable RNG and DSL builtins

`World.rngSeed` seeds a mulberry32 generator. Two DSL builtins are exposed via the `queries` object:

| builtin | signature | semantics |
|---|---|---|
| `chance(p)` | `p: 0–100` | Returns `worldRandom(world) * 100 < p` |
| `random(n)` | `n: integer ≥ 0` | Returns `floor(worldRandom(world) * n)` |

Both advance `world.rngSeed`. Because the world seed is deterministic from `RunOptions.seed`, replaying `(setup, seed)` produces identical RNG sequences. `chance(0)` is always false; `chance(100)` is always true; `random(1)` always returns 0.

---

## Consumables

### Item shape

`ItemDef` now has a `kind: ItemKind` field (`"consumable" | "equipment" | "scroll"`) replacing the old `category`. Every item also carries `level: number` (used for loot-table weighting in a later phase).

**Consumables** replace the old script DSL with a `body: SpellOp[]` list dispatched through the same `PRIMITIVES` registry as spells. Required fields: `useTarget`, `range`, `polarity` (`"buff" | "debuff"`), `body`.

**Scrolls** carry a `spell: string` field. They have no `body` — they are processed at room exit only (see below).

**Equipment** retains `slot` and `script`. The `script` field is now optional on the base type (scrolls/consumables omit it).

### EffectSpec polarity

Every `EffectSpec` has `polarity: "buff" | "debuff"`. Buffs: `regen`, `haste`, `might`, `iron_skin`, `power`, `mana_regen`, `shield`. Debuffs: `burning`, `slow`, `poison`, `chill`, `shock`, `expose`, `mana_burn`, `blinded`.

The `cleanse` primitive uses polarity to decide which effects to remove: it strips all debuffs and preserves all buffs, emitting `EffectExpired` for each removed debuff.

### Blinded effect

`blinded` (polarity: debuff, defaultDuration: 1) prevents the actor from targeting anything at Chebyshev distance > 1. The gate lives in `validateCast` step 5 (cast path) and `validateUseGates` (item use path). A blinded actor can still act — they just can't reach far targets.

### Smoke clouds

Cloud kind `"smoke"` (added to `CLOUD_KINDS`) blocks line of sight and applies `blinded` to actors standing on the tile. LOS helper `src/los.ts` is shared between `commands.ts` and `spells/cast.ts` to avoid circular imports.

**LOS model:** Bresenham-style ray from caster to target. The source tile is never opaque (you can always see from where you stand). Adjacent targets (Chebyshev ≤ 1) always have LOS. Only smoke clouds with `remaining > 0` create dynamic opacity; structural walls are not yet modelled.

**LOS gate in cast path (step 4b):** non-self spells at range > 1 are blocked if smoke occludes the line. Emits `ActionFailed` with reason `"No line of sight to target (smoke)."`.

**LOS gate in use() path:** same rule — non-self items with a tile/actor target at range > 1 are blocked by smoke.

### `use()` contract

`doUse(world, self, itemRef, targetRef?)` validates gates before consuming the item (**pre-spend discipline** — mirrors the cast path):

1. Resolve item instance from ref (by instance or name).
2. Look up `ItemDef`; must be `kind === "consumable"`.
3. Faction gate: `useTarget === "ally"` requires same faction; `"enemy"` requires different.
4. Range gate: Chebyshev distance to target must be ≤ `def.range`.
5. LOS gate: smoke must not block the path (skipped for adjacent and self targets).
6. Blinded gate: if caster has `blinded`, target must be at Chebyshev ≤ 1.

Only after all gates pass is the item removed from the bag and its `body` dispatched through `PRIMITIVES`.

### New primitives

**`cleanse`** (targetType: `"actor"`): removes all debuff effects from the target, emitting `EffectExpired` for each. Buffs are preserved.

**`permanent_boost`** (targetType: `"actor"`): permanently increments a base stat (`hp`/`mp`/`atk`/`def`/`speed`/`int`). For `hp`/`mp`, both the current value and the max are increased. Unknown stats are a no-op.

### Scroll auto-consume

When a hero successfully exits a room (`doExit` reaches a door tile), all scroll items in the bag are processed before `HeroExited` is emitted:

- If the scroll's `spell` is **not** in `hero.knownSpells`: add it, emit `SpellLearned`, emit `ScrollDiscarded(reason:"learned")`.
- If the spell is **already known**: emit `ScrollDiscarded(reason:"duplicate")`.

Scrolls are always removed from the bag. Non-scroll items are untouched. If `doExit` returns `ActionFailed` (not on a door tile), the bag is unchanged.

### Content catalogue

The consumable, elixir, bomb, and scroll registry lives in [`src/content/items.ts`](../src/content/items.ts). Categories: flat consumables (heal/mana), effect potions, permanent-stat elixirs, tile bombs (one per element), and 20 learnable spell scrolls (summons excluded).

---

## Wearables — structured data, auras, and proc hooks

### Wearable data shape (`WearableDef`)

All wearables are pure data — no DSL `script` field. The type lives in `src/types.ts`:

```ts
interface WearableDef {
  id: string; name: string; slot: Slot; category: "wearable";
  bonuses?:   Partial<Record<StatKey, number>>;   // additive stat bonuses
  on_hit?:    ProcSpec;   // fires after wearer lands a melee hit
  on_damage?: ProcSpec;   // fires after wearer takes melee damage
  on_kill?:   ProcSpec;   // fires when wearer's hit kills the target
  on_cast?:   ProcSpec;   // fires after wearer successfully casts a spell
  aura?:      AuraSpec;   // continuous effect while item is equipped
}
```

**Bonuses are additive.** `getEquipmentBonuses` sums values across all equipped slots; equipping two items each with `def:3` yields `def:6`. This replaces the former monotone-max approach.

```ts
interface ProcSpec {
  target:  "self" | "attacker" | "target";  // who receives the effect / damage
  chance?: number;          // 0–100; omitted means 100
  effect?: { kind: EffectKind; duration: number };
  damage?: number;          // positive = damage; negative = heal (-4 heals 4 hp)
}
interface AuraSpec {
  kind:       EffectKind;
  magnitude?: number;       // passed through to the Effect record
}
```

### Item catalog

31 wearables across 5 slots (hat / robe / staff / dagger / focus). Full catalog in [`src/content/items.ts`](../src/content/items.ts); each slot has at least 5 entries (registry test enforces minimum).

### Aura lifecycle

An aura is a continuous effect that lasts exactly as long as the item is equipped:

1. **Equip** — `applyEffect(world, actor, aura.kind, Infinity, { source: { type:"item", id:defId } })` is called. Duration `Infinity` signals a permanent (until-unequip) effect.
2. **Unequip** — `removeItemEffects(world, actor, defId)` strips all effects where `source.type === "item" && source.id === defId`.
3. **Swap** — the old item's aura is removed synchronously *before* the new item's aura is applied, guaranteeing no gap and no double application.
4. **Cleanse immunity** — `useItem`'s cleanse operation skips effects with `source?.type === "item"`. A cleanse_potion cannot remove an equipped aura.

`Effect.source` is a discriminated union `{ type:"actor"|"item"; id:string }` (was a plain string). This lets the engine distinguish combat-inflicted effects from equipment-granted ones.

### Proc hook contract

All four hooks share the `fireProcSpec(world, wearer, proc, target, defId)` engine:

1. **Chance gate** — if `proc.chance` is defined and `worldRandom(world)*100 ≥ proc.chance`, the proc does not fire. This consumes one RNG step regardless.
2. **Target resolution** — `"self"` → wearer; `"attacker"` → the entity that dealt damage; `"target"` → the entity that was hit.
3. **Effect application** — if `proc.effect` is defined, `applyEffect` is called on the resolved target.
4. **Damage / heal** — if `proc.damage` is defined and non-zero: positive values deal damage (minimum 1 after defense) and emit `Hit { fromProc: true }`; negative values heal (clamped to `maxHp`) and emit `Healed`.

| Hook | Trigger |
|---|---|
| `on_hit` | After a melee attack lands (`doAttack`, target hit) |
| `on_damage` | After the wearer takes melee damage from any attacker |
| `on_kill` | When a melee hit or DoT tick kills the target |
| `on_cast` | After the wearer successfully casts a spell (`doCast`, not `ActionFailed`) |

**Loop guard.** Proc damage emits `Hit { fromProc: true }`. `onDamageHook` returns `[]` immediately when called with `fromProc = true`, preventing a chain where a proc hit triggers another `on_damage`, which triggers another proc hit ad infinitum.

**DoT kill attribution.** When `burning` or `poison` ticks kill an actor, `effects.ts` calls `callOnKillHook(world, killer, victim)`. The killer is the actor whose id is stored in `effect.source.id`. This avoids a circular import: `effects.ts` exposes `wireOnKillHook(fn)` and `callOnKillHook()`; `execute.ts` registers the implementation at module load via `wireOnKillHook(_onKillImpl)`.

### Melee damage formula

```
rawDamage = max(1, effectiveStats(attacker).atk − effectiveStats(defender).def)
```

`effectiveStats` folds in all equipped-item bonuses additive-sum style before the formula runs. Minimum damage is 1 (never zero or negative, regardless of how high the defender's def is).

