# Gameplay loop (Phase 10)

Grimoire plays out room by room. Each room is a prep / run / (recap | retry)
cycle driven by a single UI-side state machine.

## State machine

Lives in [`src/ui/run-state.ts`](../src/ui/run-state.ts). The engine is
pure and does **not** know about phases, levels, or attempts — those are UI
concepts. The engine simply runs one room to a terminal event (`HeroExited`,
`HeroDied`, or maxTicks exhaustion).

```
                                 ┌──────────────────────────┐
                                 │                          │
                  startRun       v                          │
   ┌───────┐  ─────────────►  ┌───────┐   pause   ┌────────┐│
   │       │                  │running│──────────►│ paused ││
   │ prep  │ ◄───── fail ───  │       │◄──resume──│        ││
   │       │                  └───────┘           └────────┘│
   │       │                     │   │               │     │
   │       │       succeed ──────┤   └─── fail ──────┤     │
   │       │               │     │                   │     │
   │       │               v     v                   │     │
   │       │               ┌─────────┐               │     │
   │       │◄── continue ──│ recap   │               │     │
   │       │               └─────────┘               │     │
   │       │                                         │     │
   │       │ skipRoom (same level, new room, att=1)  │     │
   │       │ ◄────────────────────────────────────── │     │
   └───────┘                                               │
       ▲                                                   │
       └── resetAll (any phase → level 1, attempts 1) ─────┘
```

Four phases:

| Phase    | Canvas     | Editor   | Inventory | Inspector tab | Help tab |
|----------|------------|----------|-----------|---------------|----------|
| prep     | hidden     | editable | editable  | disabled      | enabled  |
| running  | visible    | —        | read-only | disabled      | disabled |
| paused   | visible    | —        | read-only | **enabled**   | disabled |
| recap    | hidden     | editable | editable  | disabled      | disabled |

### Counter rules

- **attempts** starts at 1 for a new room. Increments by exactly 1 on each
  failed run (hero died, user clicked Stop, or script exhausted without
  exiting). Never increments on pause/resume or successful runs.
- **level** starts at 1. Increments on success via `continueAfterRecap`.
  Skip preserves level; resetAll returns it to 1.
- Game-over semantics (max attempts / lives) are intentionally **out of
  scope** for this phase — retries are unbounded.

## Snapshot contract

When the user clicks **Run**, the controller `structuredClone`s the current
`RoomSetup` into `state.snapshot`. This snapshot captures everything
mutable that the run could touch:

- `room` (walls, doors, clouds, floorItems, chests) — cloned.
- `actors` — cloned, including hero inventory (consumables + equipped) and
  the hero's script AST.

Because every field of `RoomSetup` is plain data (no class instances, no
function references, no DOM refs), `structuredClone` is a complete deep copy.
If anything ever becomes non-cloneable, the fix is to refactor that field
into plain data — **not** to write a bespoke deep-copy.

On `fail()`, the controller replaces `state.current` with the snapshot and
clears the snapshot ref. Post-restore, `attempts++` and the phase returns to
`prep`. The live engine handle and renderer adapter are torn down separately
by the UI (`src/ui/main.ts`) — the state machine owns only data, not
resources.

On `succeed()`, the snapshot is dropped (not restored) — the next room will
be generated fresh.

## Room generation

[`src/content/rooms.ts`](../src/content/rooms.ts) exposes
`generateRoom(level, rng)` returning a `RoomSetup`. For Phase 10 this is
intentionally minimal: the demo layout with goblin HP scaled lightly by
level. Deep generation (varied shapes, multiple monster types, loot tables
per room) is a later phase. The `rng` parameter is threaded for future use.

## Where to look

| Concern                     | File                                  |
|-----------------------------|---------------------------------------|
| State machine + transitions | `src/ui/run-state.ts`                 |
| Room generator              | `src/content/rooms.ts`                |
| Button wiring + rendering   | `src/ui/main.ts`                      |
| Phase-driven CSS            | `src/ui/layout.css` (`[data-phase]`)  |
| State machine tests         | `tests/ui/run-loop.test.ts`           |
