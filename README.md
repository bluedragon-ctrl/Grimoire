# Grimoire

A browser roguelike where you write the hero's script in advance, then watch them breach procedural dungeon "systems" against monsters whose AI is written in the same language.

## Status — basic content complete

The full feature set is shipped: headless engine, full DSL (parser + interpreter + actor surface + collections + lambdas + def + control flow), deterministic RNG, 13 effect kinds, 20 spells, 31 wearables with structured procs and auras, 30+ monster templates with families/immunities, 5-archetype procedural rooms, persistent depot, run/attempt lifecycle, and the help pane.

The project is now in **bug-hunt and tuning** mode — feature work is paused; remaining work is correctness fixes, balance, content polish, and code cleanup. New PRs should default to that posture.

## Run model

A **run** is the persistent meta-state — depot, equipped gear, known spells, lifetime stats — surviving across deaths. A run ends only when the player explicitly QUITs.

An **attempt** is one descent from depth 1 down until the hero dies. Each room is procedurally generated from one of five archetypes (combat, vault, conduit, cache, trap); HP/MP persist between rooms within an attempt. On death the inventory's wearables auto-equip into empty slots, consumables flow back to the depot, keys are discarded, and the player chooses TRY AGAIN (new attempt at depth 1) or QUIT (final review → wipe → fresh).

See [docs/dungeon.md](docs/dungeon.md) for archetype rules and inventory model, [docs/gameplay-loop.md](docs/gameplay-loop.md) for the UI state machine, [docs/engine-design.md](docs/engine-design.md) for engine internals.

## Running

```
npm install
npm run dev       # open the UI — pick a loadout, edit the script, BREACH
npm test          # run the engine test suite
npm run build     # type-check + production build
```

Node 20+.
