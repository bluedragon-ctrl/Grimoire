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

## Open questions (flagging, not blocking)

- Do queries see a snapshot of world state at yield time, or live state each evaluation? **Proposed: live** — simpler, and scripts are single-threaded per actor so no race.
- Sort stability for queries with equal Manhattan distance? **Proposed: secondary key = actor id / tile (x,y) lex.**
- Does `ActionFailed` count as a fired action for cost purposes? **Proposed: yes** (as above — prevents starvation).

Will proceed with the "proposed" answers unless told otherwise.
