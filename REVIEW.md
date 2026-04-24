# Grimoire post-Phase-11 Code Review

Cold read-only pass. File citations are `file:line`. Fixes are sentence-length hints, not prescriptions.

## Critical (determinism / correctness / contract violations)

- `src/effects.ts:116` — module-scoped `let nextEffectId = 1` mints effect ids that survive across `runRoom` calls, so the same seed + same setup produce different event payloads on the second run; move the counter onto `World` (e.g. `world.effectSeq`).
- `src/spells/primitives.ts:103` — module-scoped `let nextCloudId = 1` has the same cross-run leakage for `Cloud.id` and every `CloudSpawned` / `CloudExpired` event; thread it through `World`.
- `src/items/execute.ts:46` — module-scoped `nextInstanceId` for item instances leaks across runs and is *also* forked by a second counter in `src/ui/inventory.ts:18`, so engine-minted and UI-minted ids can collide; use a single `world.floorSeq`-style counter for engine mints and a disjoint prefix for UI prefs.
- `src/scheduler.ts:196` — the generator loop catches *all* errors with a bare `catch` and only logs `ActionFailed`, silently swallowing interpreter bugs (bad Member access, type errors, ReturnSignal escaping a handler); narrow to `ParseError | ResolveError` and rethrow everything else.
- `src/interpreter.ts:256` — when a user function is called from expression position, the generator's yields are consumed and dropped (`for (const y of gen) …`), so an `attack()` inside a helper returns synchronously instead of yielding a PendingAction; either forbid side-effectful calls in expressions or propagate via `yield*`.
- `src/spells/cast.ts:107` — `targetPos = targetActor!.pos` aliases the live actor's `pos` object by reference, so if the actor moves between validation and projectile landing the spell lands on the new tile; clone `{x,y}` at resolve time.
- `src/spells/primitives.ts` (`asPos`) — returns `actor.pos` by reference to primitives, which then pass it to `CloudSpawned` / `VisualBurst`; later actor movement mutates the already-logged event payload. Clone positions before emitting.
- `src/engine.ts:66` — `jsonSafe` duck-types Actors as "object with `typeof obj.kind === 'string'`", so any user-scripted dict that happens to have a string `kind` field is silently replaced with `{id,kind,…}`; key off a nominal brand or the actor's identity against `world.actors`.
- `src/commands.ts:323` — `doCast` special-cases `spell === "heal"` + self-target at the engine layer, bypassing the declarative spell pipeline; fold into `cast.ts` so the engine has no per-spell branches.
- `src/commands.ts:32` — `DAMAGE_BY_KIND` legacy table is still consulted for attack damage, bypassing equipment `atk` bonuses for any actor whose kind matches an entry; delete and compute from `actor.atk` + equipment only.
- `src/commands.ts` (doAttack) — defender `def` is never subtracted from melee damage, so the DEF stat surfaced in the inventory UI (`src/ui/inventory.ts:211`) is a lie for physical hits; apply `max(1, dmg - def)`.
- `src/spells/primitives.ts` (project/inflict) — spell damage also ignores defender `def`; same fix at the primitive layer.
- `src/content/rooms.ts:98` — a second hand-rolled mulberry32 implementation lives here (`seededRng`) parallel to `src/rng.ts`, so world-gen and runtime advance independent streams and a "same seed" guarantee is split brain; import from `rng.ts`.
- `src/content/loot.ts` — `LOOT_TABLES["goblin"]` (legacy alias, chance 0.5) and `LOOT_TABLES["goblin_loot"]` (Phase 11 canonical, chance 0.3) both exist and differ; actors fall back to `actor.kind` when `lootTable` is absent, so which one fires depends on field presence. Delete the alias or make them equal.
- `src/items/execute.ts:253` — `wireEquipmentBonuses(...)` runs as a side effect on module import, installing a global singleton resolver read by `commands.ts`; one test that imports in a different order gets a different scheduler. Make the wiring explicit per-run.
- `src/effects.ts:259` — `_equipmentBonuses` global singleton means two in-flight worlds (e.g. a headless test + main.ts) race; move onto the world or a factory.
- `src/effects.ts:189` — the `_elapsed` side-channel is stashed with `(eff as any)._elapsed = …`, untyped and invisible to `jsonSafe`/snapshot; promote to a real field on `Effect`.
- `src/render/wire-adapter.ts:369` — `CloudSpawned` handler sets `duration: 1` regardless of the engine's declared cloud duration, so the renderer can never show the real fade timing; read from the event.
- `src/render/wire-adapter.ts:443` — incrementing `s.tick++` per event inside the event loop confuses "renderer animation tick" with "engine tick" and is the source of the hack at line 522 (dead-monster grace period counted in events, not ticks); use engine tick directly.
- `src/render/mount.ts` — `apply()` may return a Promise but the pacing loop never awaits it; on slow frames two applies can interleave and mutate the scene concurrently. Await.
- `src/ui/main.ts` — UI reaches into `handle.world` to drive the inspector, but the engine snapshot/restore flow (`run-state.ts:79`) deep-clones via `structuredClone` including generator-stashed frames which are non-cloneable on some runtimes; validate that `structuredClone` survives on all target browsers or switch to a custom clone that skips runtime-only fields.
- `src/lang/errors.ts` — `KNOWN_NAMES` omits many real bindings (`items_here`, `can_cast`, `has_effect`, `adjacent`, `pickup`, `drop`, `use`, `me`, `attacker`) so `didYouMean` misleads users toward wrong identifiers; regenerate from the actual `queries` + commands registries.

## Should-fix (type safety / dead code / magic strings / error handling)

- `src/lang/errors.ts` — `"halt"` appears twice in `KNOWN_NAMES`; dedupe and add a unit test that the table is a set.
- `src/commands.ts:65,78,108,123` — heavy `as any` clustering around target resolution; introduce a `ResolvedTarget` union and a single narrowing helper.
- `src/spells/cast.ts:171-174` — post-hoc backpatching of `Cast.amount` from `Hit`/`Healed` events via `(castEvent as any).amount = …`; make `Cast` carry the amount at emission time from the primitive return value.
- `src/spells/cast.ts:30` — `sameFaction` compares `isHero` only; two non-hero factions (summons vs monsters) will eventually share "not hero" and friendly-fire; introduce an explicit `faction` field.
- `src/interpreter.ts` — `return` is implemented via `throw new ReturnSignal`; works but the bare `catch` in `scheduler.ts:196` can now swallow a returning closure outside a function body. Guard with instanceof checks at both ends.
- `src/scheduler.ts:91-103` — refund-on-failure logic is duplicated for `cast`/`use`/`pickup`/`drop`; factor to `refundCost(actor, action)`.
- `src/items/loot.ts:172` — `void mintInstance;` suppression on an unused import is a code smell; remove the import or remove the helper.
- `src/items/execute.ts:110` — consumable item scripts silently ignore `merge`/`on_hit` ops without a warning; emit a parse-time error in `items/script.ts` instead.
- `src/render/wire-adapter.ts` (~ dead monster grace) — grace counted in rendered events, not wall ticks, so high-frequency events evict the corpse too fast; count real ticks.
- `src/render/wire-adapter.ts` — renderer falls back to `"skeleton"` visual when `visual/baseVisual/kind` are absent; this is silent data corruption. Log once and make it a typed warning.
- `src/content/rooms.ts` — `buildHeroScript` duplicates the hero script in `src/demo.ts`; extract to `content/hero.ts`.
- `src/content/rooms.ts` — hero `kind === "hero"` is still hard-coded in one branch; Phase 11 made `kind` a free-form id, so this should read `isHero`.
- `src/commands.ts` (COST table) — raw string keys for PendingAction kinds (`"approach"`, `"cast"`, …) duplicated across `scheduler.ts` refund logic; promote to a shared union constant.
- `src/engine.ts` (`cloneActor`) — normalizes missing stats with numeric defaults (`mp ?? 20` etc.); these defaults also appear inline in `src/ui/inventory.ts:193-199`. Single source.
- `src/lang/parser.ts:382-388` — `halt` keyword is handled as a special-cased identifier; promote to a proper token so tokenizer reports a clear error when someone writes `halt = 3`.
- `src/lang/tokenizer.ts` — tab+space mixing rejected outright but tabs treated as 1 column in `SourceLoc`; editor highlights shift. Either expand to configured tab width or reject tabs entirely.
- `src/effects.ts` — `EffectKind` is a closed union but item scripts reference strings freely; misspellings become silent no-ops. Validate at script-parse time.
- `src/types.ts:76` — `ActorKind = string` (Phase 11) makes every `kind`-driven switch (there are still some in `wire-adapter.ts`, `rooms.ts`, `loot.ts` fallbacks) invisible to the type checker; add a branded `KnownKind` for built-ins.
- `src/render/wire-adapter.ts` — actor visual is derived from three optional fields (`visual`, `baseVisual`, `kind`) with a fallback chain; collapse to one canonical `visualId` resolved at `createActor`.
- `src/interpreter.ts:232` — `(queries as any)[name](…)` bypasses the query registry's type signature; declare `queries` as `Record<string, QueryFn>` and drop the cast.
- `src/spells/cast.ts` — 6-step validation pipeline re-reads `actor.mp` by reference and subtracts after emit; if a prior step mutates mp (effects) the deduction is off. Read at step 1 into a local.
- `src/content/rooms.ts` — room generator uses its own seeded RNG separate from the world's (`World.rngSeed`); loot drops will not be replayable together with layout. Unify.
- `src/items/execute.ts` — `getItemOps` cached map is populated lazily and never invalidated; OK today, but hot-reload during dev will serve stale ops.
- `src/engine.ts` — `runRoom`'s `maxTicks` is an absolute cap, not a wall-clock budget; a pathological script can spin through ticks with no yields if anyone introduces a zero-cost loop. Add a per-tick yield budget.
- `src/render/effects.ts` — effect visuals are keyed by `EffectKind` string; adding a new effect requires edits in three files (effects.ts, render/effects.ts, content/items.ts). Registry-ize.
- `src/ui/main.ts` — the event log / inspector mutates DOM during engine ticks (via `onTick` hook wiring); if the engine ever goes async these writes race. Queue into `requestAnimationFrame`.
- `src/content/monsters.ts` — templates are deep-frozen but AI parse errors throw synchronously at module load, which crashes the entire UI before a user-friendly error can render; wrap in a typed `TemplateLoadError` caught by `main.ts`.
- `src/items/loot.ts` — `rollDeathDrops` falls back to `actor.kind` when `lootTable` is absent, which was *deliberate* for legacy but now also masks typos in new templates; require `lootTable` on templates, delete the fallback.
- `src/commands.ts` (doAttack) — attack damage reads `actor.atk ?? 3`; the `?? 3` fallback silently upgrades un-normalized monsters to hero-tier damage. Require normalized actors at the engine boundary.
- `src/spells/cast.ts` — `knownSpells` check uses `includes`; a level-up "learn spell" flow (Phase 12?) will need dedupe. Use `Set<string>`.
- `src/content/loot.ts` — chance values are raw numbers; no documentation on whether they're independent rolls or summed. The code implements independent rolls — mention it and add a lint that warns when `sum > 1`.

## Nits (naming / layering / polish)

- `src/types.ts:82` — comment still mentions "code that used to compare kind === 'hero'" but the repo-wide grep shows zero such comparisons in non-comment code; comment is now archaeology, trim.
- `src/types.ts` — `ActionFailed.reason` is free-form string; define a closed union so tests can match structurally.
- `src/ui/run-state.ts:133` — TODO for skip cost still open; file an issue instead of a code TODO.
- `src/ui/inventory.ts:18` — separate instance-id counter in UI layer; confusing. Comment or share.
- `src/ui/inventory.ts:190-199` — inline stat defaults duplicate `cloneActor`.
- `src/engine.ts` — `jsonSafe` lives in engine.ts but is a pure serializer; move to `src/log.ts`.
- `src/scheduler.ts` — `stepOne` is ~200 lines with 5 levels of nesting; extract handler-dispatch and refund-on-fail.
- `src/interpreter.ts` — `ReturnSignal` class has no TS brand and can be created by user code if imported. `#private` or module-local only.
- `src/lang/parser.ts` — recursive descent has no statement-start recovery; one typo cascades. Add sync-on-newline.
- `src/lang/errors.ts` — `didYouMean` uses naive Levenshtein; `attaxk` → `attack` OK, `atakc` → `attack` works, but `att` → `attack` doesn't match. Tune threshold.
- `src/render/wire-adapter.ts` — file is >500 lines and mixes event translation with sprite bookkeeping; split.
- `src/render/mount.ts` — uses `setTimeout` for pacing; `requestAnimationFrame` would pause on hidden tabs.
- `src/content/items.ts` — item visual preset ids duplicate the `defId` string across two files; add a compile-time assertion.
- `src/content/spells.ts` — spell names are strings; extract to enum for typoed refs in handler bodies.
- `src/content/clouds.ts` — cloud kinds duplicated between `CLOUD_KINDS` object and event `kind` field; share a const.
- `src/content/monsters.ts` — `MONSTER_TEMPLATES` frozen via `Object.freeze`, not deep-frozen; a test that mutates `template.visual` would escape.
- `src/ui/main.ts` — many DOM ids hard-coded in string form; collect into a `DOM_IDS` const.
- `src/ast-helpers.ts` — `cAttack`/`cApproach`/`cCast` names drift from the AST node names they build; rename to `attackCmd`, etc.
- `src/demo.ts` — hero script is a literal AST tree; migrate to DSL source + one-time parse, to stop drifting from `rooms.ts`.
- `src/types.ts` — `PendingAction` union has 10 variants, only 3 of which use `locals`; make it non-optional and document purpose.
- `src/engine.ts` — `buildWorld` initializes `floorSeq: 0` but also `rngSeed: seed|0`; comment about why `|0`.
- `src/content/items.ts` — item `description` never surfaces in UI; either show it in the picker tooltip or drop the field.
- `src/render/adapter.ts` — `apply/mount/teardown` contract is documented as sync but several adapters return `Promise<void>`; tighten the interface.
- `src/content/visuals.ts` — some visual ids are snake_case (`fire_bolt`) and others kebab (`ice-shard`); pick one.
- `src/commands.ts` — `COST` table value `cast: 6` hard-coded; should be per-spell in `content/spells.ts`.
- `src/spells/primitives.ts` — `inflict` takes `duration` in ticks but scaling applies outside; name it `rawDuration`.

## Coverage gaps (tests/)

- `tests/engine.test.ts` — no test that a handler fires *after* `halt()` has ended the main frame (spec says handlers may still run; behavior untested).
- `tests/engine.test.ts` — no determinism test (same seed → same log) for loot drops, cloud ids, or effect ids. Given the module-scoped counter bugs above, this would currently *fail* across back-to-back runs.
- No test covers `external abort()` *during* a handler frame; `run-state.ts` snapshot/restore is untested.
- No test for equipment bonuses actually reaching `atk`/`def`/`speed` in damage math.
- No test for `def` reducing incoming damage (because the feature doesn't exist).
- No test for `cast` refund on mid-flight failure (e.g. target dies between step 3 and step 5).
- No test for `DAMAGE_BY_KIND` legacy fallback deprecation.
- No test for `rollDeathDrops` with a missing `lootTable` (fallback to `actor.kind`).
- No test that `buildWorld` seeding reproduces identical `floorSeq` minting across runs.
- No parser test for `halt` as identifier in expression context (current `parser.ts:382` special case).
- No integration test that `mountInventoryPanel` refresh is idempotent (it rebuilds DOM each call).
- No test for cloud duration override in renderer (`wire-adapter.ts:369` hard-codes 1).
- `tests/` structure: test file helper still computes `kind === "hero"` defaults (`tests/engine.test.ts:17`) — code smell post-Phase 11 though not a correctness bug.
- No test for `interpreter.ts:256` (user function called in expression position; currently silently swallows yields).

## Systemic observations

1. **Mutable module-level state is the single biggest source of non-determinism.** Four counters (`nextEffectId`, `nextCloudId`, `nextInstanceId` × 2) and two singletons (`_equipmentBonuses`, item-ops cache) all live at module scope. Every one is a landmine for the "same seed = same log" guarantee the docs promise. Moving them onto `World` (or a per-run `Registry`) would close the whole category in one pass.

2. **Untyped seams via `as any` cluster at the resolution boundaries.** Target resolution (`commands.ts`, `cast.ts`) and the interpreter's polymorphic value surface (`interpreter.ts`) together account for most of the unsafe casts. A small `ResolvedTarget` union plus a `Value` discriminated union would make the interpreter safe without runtime cost and would surface the silent yield-drop in expression-position calls.

3. **Two-layered fallback chains hide Phase 11 residue.** Loot tables fall back `lootTable → kind`, visuals fall back `visual → baseVisual → kind → "skeleton"`, damage falls back `atk ?? 3`, stats fall back `mp ?? 20`. Each fallback made Phase 11 migration tractable, but now obscures missing data and lets typos silently succeed. A "strict mode" that throws on any fallback during normalization (`cloneActor` / `createActor`) would turn content bugs into fail-fast errors.

Severity counts: 22 Critical, 33 Should-fix, 28 Nits, 14 Coverage gaps.

---

## Phase 11.6 resolution — Critical items addressed

PR: [Phase 11.6: critical review fixes](https://github.com/bluedragon-ctrl/Grimoire/pull/14) *(pending)*

The following Critical items are resolved in this PR. Should-fix, Nits,
and Coverage gaps are intentionally left for later phases.

| # | Item (abbreviated) | Resolution |
|---|---|---|
| 1 | `effects.ts:116` module-scoped `nextEffectId` | Migrated to `world.effectSeq`; initialized to `0` in `buildWorld`. |
| 2 | `spells/primitives.ts:103` module-scoped `nextCloudId` | Migrated to `world.primitiveSeq`; initialized to `0` in `buildWorld`. |
| 3 | `items/execute.ts:46` module-scoped `nextInstanceId` | `world.itemSeq` field added to `World` and initialized; `mintInstance` has no engine call sites so does not affect determinism — no behavior change. |
| 4 | `scheduler.ts:196` bare `catch` swallows all errors | Narrowed to `DSLRuntimeError`; converts to `ScriptError` log event. All other throws propagate out of `runRoom`. |
| 5 | `interpreter.ts:256` silently drops yields from user funcs in expression position | `callUserFunc` now throws `DSLRuntimeError("function with action cannot be called in expression position")` immediately on first yield. |
| 6 | `commands.ts:32` `DAMAGE_BY_KIND` table bypasses `actor.atk` | Deleted. `doAttack` now uses `actor.atk ?? 1` only. |
| 7 | `content/loot.ts` `LOOT_TABLES["goblin"]` alias disagrees with `goblin_loot` | Deleted the `"goblin"` key. `rollDeathDrops` fallback `lootTable ?? actor.kind` removed — templates must declare `loot` explicitly. |

**New tests added:**
- `tests/engine/determinism.test.ts` — byte-for-byte log equality across two `runRoom` calls with the same seed. Explicitly verifies `CloudSpawned` id equality (the regression that would have failed before `primitiveSeq`).
- `tests/lang/errors.test.ts` — user func with action in expression position emits `ScriptError`; non-DSL JS errors propagate out.
- `tests/content/validation.test.ts` — registry load-time validation for malformed monster templates and loot entries.

**Remaining Critical items (not in Phase 11.6 scope):**
Items 3 (wireEquipmentBonuses singleton), 4 (`_equipmentBonuses` global), `_elapsed` side-channel, `asPos` aliasing, `targetPos` aliasing in cast.ts, `doCast` special-case, `def` not applied to damage, `seededRng` duplicate in rooms.ts, `jsonSafe` duck-typing, `mount.ts` unawaited Promise, `run-state.ts` structuredClone issue, `wire-adapter.ts` issues, `KNOWN_NAMES` gaps — deferred to future phases.
