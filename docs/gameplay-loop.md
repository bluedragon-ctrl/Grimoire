# Gameplay loop — UI state machine

This doc covers the **UI state machine**: the six phases the prep/run/recap UI cycles through. The underlying run/attempt model and dungeon mechanics live in [dungeon.md](dungeon.md).

The engine itself is pure and does **not** know about phases or attempts — it simply runs one room to a terminal event (`HeroExited`, `HeroDied`, or `maxTicks` exhaustion). Phases are a UI concept.

## Phases

State and transitions live in [src/ui/run-state.ts](../src/ui/run-state.ts).

```
                                 pause
                          ┌──────────────►──────────┐
                          │                         v
   ┌──────────┐ start  ┌───────┐                ┌────────┐
   │ loadout  │───────►│running│ ◄── resume ─── │ paused │
   └──────────┘        └───────┘                └────────┘
       ▲                  │                         │
       │ tryAgain         │ HeroDied                │ HeroDied
       │                  ▼                         ▼
       │            ┌──────────────┐                │
       └────────────│ death_recap  │◄───────────────┘
                    └──────────────┘
                       │      │
                requestQuit   │ (HeroExited stays in `running`;
                       │      │  advanceDepth regenerates the next
                       ▼      │  room within the same attempt)
                ┌──────────────┐
                │ quit_confirm │── cancelQuit ──► death_recap
                └──────────────┘
                       │ confirmQuit
                       ▼
                ┌──────────────┐
                │ final_review │── acknowledgeFinal ──► loadout (fresh run)
                └──────────────┘
```

| Phase          | Meaning                                                        |
|----------------|----------------------------------------------------------------|
| `loadout`      | Pre-attempt screen: pick up to 4 consumables, edit script + equipment, BREACH |
| `running`      | Engine driving; hero acting in the current room                |
| `paused`       | Engine paused; inspector visible                               |
| `death_recap`  | Hero died this attempt — show recap, offer TRY AGAIN / QUIT    |
| `quit_confirm` | Confirmation dialog for QUIT                                   |
| `final_review` | Post-quit summary; on ack, wipes localStorage and reseeds      |

`HeroExited` does **not** change phase — `advanceDepth(carryHero)` regenerates the next room within the same attempt while staying in `running`. HP/MP and inventory carry over between rooms; only `HeroDied` triggers the recap.

## UI gating

```ts
inspectorTabEnabled(phase) === phase === "paused"
helpTabEnabled(phase)      === phase === "loadout"
```

The script editor and inventory/equipment pickers are read-only outside `loadout`. The canvas is hidden during `loadout`, `death_recap`, `quit_confirm`, and `final_review`.

## Counter rules

- `attempts` starts at 1. Increments by exactly 1 on `tryAgain` (each TRY AGAIN is a fresh descent at depth 1). Never increments on pause/resume or successful exits.
- `depth` starts at 1, increments on `advanceDepth` (successful `exit()`), resets to 1 on `tryAgain` and `acknowledgeFinal`.
- `run.stats.deepestDepth` is monotone-max across all attempts within the run.
- `run.stats.attempts` mirrors the attempt counter.
- Game-over semantics (max attempts, lives) are intentionally absent — TRY AGAIN is unbounded until QUIT.

## Persistence

The `run` field (`PersistentRun`) is serialized to a single localStorage key (`grimoire.run.v1`) on every phase transition that mutates it: `startAttempt`, `advanceDepth`, `die`, `tryAgain`, `acknowledgeFinal`. `confirmQuit` snapshots into `finalSnapshot` for the review screen but does not wipe yet — `acknowledgeFinal` is what clears storage and reseeds.

Inventory is **not** snapshotted for rollback. On `die`, `routeInventoryToRun(hero, run)` moves the dead hero's wearables into open equipment slots (or back to depot), consumables into the depot, and discards keys. The next `startAttempt` rebuilds the hero from `run.equipped` + the loadout selection via `buildAttemptHero`.

## Where to look

| Concern                         | File                                       |
|---------------------------------|--------------------------------------------|
| State machine + transitions     | [src/ui/run-state.ts](../src/ui/run-state.ts) |
| Persistence + inventory routing | [src/persistence.ts](../src/persistence.ts) |
| Dungeon room generation         | [src/dungeon/generator.ts](../src/dungeon/generator.ts) |
| Button wiring + rendering       | [src/ui/main.ts](../src/ui/main.ts)       |
| Phase-driven CSS                | `src/ui/layout.css` (`[data-phase]`)       |
| State machine tests             | [tests/ui/run-loop.test.ts](../tests/ui/run-loop.test.ts) |
| Death recap + try-again tests   | [tests/ui/recap.test.ts](../tests/ui/recap.test.ts) |
