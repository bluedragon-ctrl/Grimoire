# Grimoire — orientation for Claude

A browser roguelike. Player writes a hero script in advance; engine runs it against procedurally-generated rooms full of monsters whose AI is written in the same DSL.

**Status: basic content complete, in bug-hunt and tuning mode.** Feature work is paused. Default posture for new changes: correctness fixes, balance, content polish, code cleanup. Don't propose new mechanics or systems unless asked.

## Where things live

```
src/
  engine.ts            runRoom() public API — owns the abort signal
  scheduler.ts         tick loop: energy, dispatch, events
  interpreter.ts       compile(ast) → per-actor generator
  commands.ts          command impls + zero-cost queries + resolveTarget
  effects.ts           effect kinds, applyEffect, tickEffects, effectiveStats
  clouds.ts            cloud lifecycle + tick
  los.ts               smoke-aware Bresenham line-of-sight
  rng.ts               mulberry32, worldRandom (deterministic per World.rngSeed)
  persistence.ts       localStorage load/save, attempt routing
  spells/              cast.ts (validation pipeline) + primitives.ts (op registry)
  items/               execute.ts (use/equip/unequip/procs/aura), loot.ts
  dungeon/             archetypes.ts, generator.ts, objects.ts
  lang/                tokenizer, parser, errors, event-registry, actor-surface,
                       collection, index (parse() entry point)
  content/             data registries: items, monsters, spells, loot, clouds,
                       visuals, scaling, ai-archetypes, rooms
  render/              wire-adapter (engine→state translator), mount, pure-pixel
                       draws, vendor/ bundle for tiles/entities/monsters/objects
  ui/                  main, run-state (state machine), inventory, help/ pane
docs/                  current-state design notes (see below)
docs/archive/          frozen historical reviews — line numbers are stale
tests/                 vitest suites, structure mirrors src/
```

Useful entry points:
- `src/engine.ts::runRoom` — engine boundary
- `src/scheduler.ts::stepOne` — main per-step logic
- `src/ui/run-state.ts::RunController` — UI state machine + persistence wiring
- `src/dungeon/generator.ts` — room generation
- `src/lang/index.ts::parse` — DSL parse entry point

## Docs

| Doc | Topic |
|---|---|
| `docs/engine-design.md`   | Layers, scheduler, effects, commands, events, spells, summoning, consumables, wearables — internals reference |
| `docs/dungeon.md`         | Run/attempt lifecycle, archetypes, dungeon objects, inventory model |
| `docs/gameplay-loop.md`   | UI state machine (loadout / running / paused / death_recap / quit_confirm / final_review) |
| `docs/items.md`           | Item system: consumables (`body: SpellOp[]`), wearables (structured `bonuses` / procs / auras), scrolls, loot, pickups |
| `docs/monsters.md`        | Templates, families, immunities, scaling, AI scripts |
| `docs/dsl-queries.md`     | DSL query reference |
| `docs/visuals.md`         | Visual preset catalog |
| `docs/rendering.md`       | Renderer pipeline |
| `docs/help-system.md`     | In-game help pane |

If a question is answerable from one doc, prefer that doc over reading multiple source files. The docs are kept current; they are not historical changelogs.

## Conventions

- **Phase labels are obsolete.** The codebase shipped through "Phases 1–15"; that numbering is now gone from docs and test filenames. Don't add `Phase X` headings or comments to new code or docs.
- **Determinism is load-bearing.** Same `(setup, seed)` must produce a byte-identical event log. Never call `Math.random()` inside `src/`. Every random decision goes through `worldRandom(world)`. Don't introduce module-level mutable state — counters and caches that survive across `runRoom` calls break replay.
- **Engine is pure.** It does not know about phases, attempts, or persistence. Those are UI concepts in `src/ui/run-state.ts`. Don't push UI/run state into the engine.
- **Bonuses are additive.** Two equipped items each with `def: 3` give `+6 def`. Old monotone-max merge rule is gone. (Aura source-tagged effects are immune to `cleanse`.)
- **Pre-spend discipline.** `cast` and `use` validate gates (faction, range, LOS, blinded, mana) *before* deducting cost. Failed actions emit a single `ActionFailed` and refund energy via the scheduler.
- **DSL command calls are expressions.** `if attack(foe):` resolves to true/false from the resulting event bundle. Statement-level calls discard the bool.
- **Distance metric** is Chebyshev for actor-to-actor; Euclidean for AoE shapes (so radius-2 explosions render as round blobs).
- **No emojis** in code, comments, or docs unless the user explicitly asks.
- **Don't write new docs files.** Edit existing docs instead. Only `CLAUDE.md` and the docs listed above are load-bearing.
- **Don't mock the engine.** Tests run real `runRoom` calls — engine clones inputs on entry, so the test fixture stays clean. Mock-everything tests have proven false-positive-prone.

## Workflows

```
npm test            # vitest, ~9s, full suite
npm run build       # tsc -noEmit + vite build (catches type errors)
npm run dev         # vite dev server for the UI
```

Always run `npm test` after changes that touch `src/`. Run `npm run build` when changing types, exports, or imports — vitest doesn't catch all type errors.

UI changes need browser verification: start the dev server and use the feature. The test suite verifies engine behavior, not what the user sees.

## What NOT to do

- Don't introduce phase headings, phase tags in filenames, or "Phase N" comments — that scaffolding was deliberately removed.
- Don't mock module-internal state to make tests pass; fix the underlying coupling instead.
- Don't add backwards-compatibility shims for fields/types you just renamed — there is no external API surface.
- Don't read `docs/archive/` to understand current state. Those are frozen historical artifacts; line numbers and "open items" are stale.
- Don't recreate `Samples/` or reference it. The renderer port is complete; `Samples/` was the source-of-truth prototype, now removed.
- Don't propose new spells, items, monsters, or mechanics unless explicitly asked. Content is frozen.

## Common starting points

- **"Where does X happen?"** → grep `src/` first. The doc is for design rationale; the code is the truth.
- **"This test is flaky"** → check for module-level mutable state in the file under test (counters, caches). Determinism is the most common culprit.
- **"How do I add a new effect kind?"** → `src/effects.ts::REGISTRY`, then `src/render/effects.ts` for visuals, then content registry. (Consider whether you actually need a new kind — content is frozen.)
- **"How do I read the event log?"** → `runRoom` returns `EventLog`; events are typed in `src/types.ts`. Tests use `tests/helpers.ts::collectEvents`-style helpers.
