# Grimoire

A browser roguelike where you write the hero's script in advance, then watch them breach procedural dungeon "systems" against monsters whose AI is written in the same language.

## Run model (Phase 15)

A **run** is the persistent meta-state — depot, equipped gear, known spells, lifetime stats — surviving across deaths. A **run** ends only when the player explicitly QUITs.

An **attempt** is one descent from depth 1 down until the hero dies. Each room is procedurally generated from one of five archetypes (combat, vault, conduit, cache, trap); HP/MP persist between rooms within an attempt. On death the inventory's wearables auto-equip into empty slots, consumables flow back to the depot, keys are discarded, and the player chooses TRY AGAIN (new attempt at depth 1) or QUIT (final review → wipe → fresh).

See [docs/dungeon.md](docs/dungeon.md) for archetype rules, the run lifecycle, and the inventory model.

## Status

Phases 1–15 implemented. Headless engine, full DSL, deterministic RNG, 5-archetype procedural rooms, persistent depot + run stats. See [docs/engine-design.md](docs/engine-design.md).

## Running

```
npm install
npm run dev       # open the UI — pick a loadout, edit the script, BREACH
npm test          # run the engine test suite
```

Node 20+.
