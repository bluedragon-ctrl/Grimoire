# Samples renderer — API findings

Reviewed: `Samples/renderer.js`, `visuals.js`, `render-tiles.js`, `render-entities.js`,
`render-monsters.js`, `render-items.js`, `render-objects.js`, `render-effects.js`,
`render-prims.js`.

## 1. Shape of the API

**It is not an imperative animation API.** There is no `spawnEntity(id)`, `moveEntity(id, to)`,
`playAttack(attacker, target)`. The renderer is **pure state-snapshot → frame**.

Public surface (`renderer.js`):

```js
initRenderer(canvasElement)      // one-time setup + resize listener
render(state)                    // draw one frame from a state snapshot
```

That's it. Everything else (`drawMage`, `drawMonster`, `drawTile`, `drawEffect`, …) are
internal helpers exported for composition, not a public animation API.

### Mount target
A `<canvas>` DOM element. `initRenderer` calls `resizeCanvas` which:
- reads `canvas.parentElement.getBoundingClientRect()` for width
- reads `document.getElementById('bottom-panel').offsetHeight` for height offset
- attaches a global `window.addEventListener('resize', …)`

→ **Not drop-in for our `#game-view` div.** Either we host a canvas inside it and
provide a dummy `#bottom-panel`, or we replace `resizeCanvas` with our own sizer.

### Frame model
Host-driven — the renderer does **not** own a RAF loop. Each call to `render(state)` draws
one frame. `animTime` advances by a fixed `FRAME_TIME = 0.016` per call (so smooth-looking
animation requires the host to call `render` at ~60 Hz). Camera damping (`CAMERA_DAMPING = 0.2`)
also assumes per-frame invocation.

→ Our `mount.ts` needs a RAF loop for *visual smoothness* even though event **pacing** is
`setTimeout`-driven. The two concerns are separate: `setTimeout` advances our logical
"visual state" one event at a time; RAF calls `render(visState)` 60×/sec.

This contradicts the Phase 3 prompt's "No RAF in mount.ts" constraint — see question 3 below.

### Identity model
Entities are identified by `id` (string, e.g. `'player'`, monster `m.id`). Overlays attach
to entities via `attachTo: '<entity-id>'`. There are no handles returned on spawn — the
host mutates `state.monsters`, `state.activeEffects`, etc., and the renderer reads them.

## 2. Expected state shape

`render(state)` reads (non-exhaustive):

```
state.player         { x, y, colors }
state.monsters[]     { id, x, y, type, colors, baseVisual, dead?, deadAt? }
state.floorItems[]   { x, y, type, colors }
state.floorObjects[] { x, y, type, state?, colors, hidden? }
state.clouds[]       { kind, duration, maxDuration, tiles[], }
state.activeEffects[] { kind: 'overlay'|'projectile'|'area'|'tileCloud',
                        name, delay, duration, elapsed, colors,
                        attachTo?, from?, to?, at?, radius?, tiles? }
state.width, state.height, state.tick
```

It also calls helpers imported from **modules that do not exist in our repo**:
- `../engine/game-state.js` → `getTile, isVisible, isExplored, isAlive`
- `../engine/effects.js` → `hasActiveEffectFor`
- `../config/clouds.js` → `CLOUD_DEFS`
- `../config/tiles.js` → `TILE_DEFS`
- `./render-context.js` → `TILE, C, setCanvas, getCanvas, getCtx, wire, lighten, darken`

→ **The Samples drop is not runnable as-is.** `render-context.js` and the `engine/`,
`config/` modules are all missing. Without them, zero imports resolve.

## 3. Mapping our `GameEvent` log → renderer calls

Because the renderer is state-driven, the adapter can't just "call a move animation" per
event. The shape that actually fits:

1. Adapter maintains a **VisualState** object (local to the adapter) with the shape the
   Samples renderer expects — `player`, `monsters[]`, `activeEffects[]`, etc.
2. `apply(event)` mutates `VisualState` (e.g. `Moved` updates `player.x/y`; `Attacked`
   pushes a short-lived `overlay` effect into `activeEffects`; `Died` sets `dead=true`
   and `deadAt=tick`; `Cast` pushes a `projectile` into `activeEffects`).
3. A RAF tick calls `render(visState)`, decrements effect `duration`s, etc.

Event → mutation sketch (my proposed mapping — please confirm):

| Event          | VisualState mutation                                                           |
|----------------|--------------------------------------------------------------------------------|
| `Moved`        | set `actor.x/y` to `to` (renderer has no tween — snap + let camera damp)       |
| `Attacked`/`Hit` | push `overlay` `strike_flash` attached to target for ~2 frames              |
| `Died`         | set `target.dead = true; deadAt = tick`                                        |
| `Healed`       | push `overlay` `heal_sparkle` attached to target                               |
| `Cast`         | push `projectile` from→to with preset from element/visual flag                 |
| `ActionFailed` | push small `overlay` shake on actor; TODO if too noisy                         |
| `HeroExited`   | fade hero (overlay) then remove from state next tick                           |
| `Halted`/`Waited` | no visual effect                                                            |

This is speculative — the Samples renderer only renders overlays/effects **declared by
name** in `render-effects.js`. I haven't verified the names `strike_flash`,
`heal_sparkle` exist; may need to fall back to whatever effect names `render-effects.js`
actually defines, or use generic presets from `visuals.js` (e.g. `burst_ember`).

## 4. Ambiguities — need user input before writing adapter code

1. **Missing modules.** `render-context.js`, `engine/game-state.js`, `engine/effects.js`,
   `config/tiles.js`, `config/clouds.js` are all missing. Options:
   - (a) You paste them in too.
   - (b) I stub them (e.g. a minimal `render-context.js` with `TILE=32`, basic colors,
     canvas accessors; stub `isVisible`/`isExplored` to always-true for Phase 3;
     stub configs to cover only the monster/tile types we use).
   - (c) I fork a cut-down renderer that only imports what we need and drops the rest.

2. **`#bottom-panel` sizing assumption.** Renderer's `resizeCanvas` hard-codes a sibling
   DOM id. Should I (a) add a `#bottom-panel` element to our `index.html`, or
   (b) replace `resizeCanvas` with something that just fills `#game-view`?

3. **RAF vs. "no RAF in mount.ts".** The prompt says `mount.ts` must use `setTimeout`
   so fake timers work. But the Samples renderer needs ~60 Hz `render()` calls for
   smooth camera/effect animation. I see two resolutions:
   - (a) `setTimeout` paces **events**; a small RAF loop **inside the adapter** (not
     `mount.ts`) drives `render()` calls. Fake timers still work for the event-pacing
     test because the RAF isn't what the test observes.
   - (b) Replace RAF with a 16 ms `setInterval` in the adapter.
   - (c) Snap-render: call `render(visState)` once per event dispatch, no continuous
     frame loop. Loses camera damping and effect animation; events appear as static
     pose changes.
   I'd pick (a). OK?

4. **Event → effect-name mapping.** I want to grep `render-effects.js` for the actual
   effect names it supports and map our events to those. Is that fine, or do you have
   a preferred mapping?

5. **Actor visuals for Phase 1/2 scripts.** Our `Actor` type currently has `{ id, kind:
   'hero'|'monster', hp, … }` with no sprite type. Should the hero always render as
   `drawMage` and monsters as `drawSkeleton` by default, with an optional `visual`
   field on Actor? Or do you want to extend the script language with a `visual=`
   flag in Phase 3 too?

## 5. Recommended plan (pending your answers)

- Stub `render-context.js` with the minimum (TILE, colors, canvas accessors).
- Stub `engine/game-state.js` helpers (always-visible Phase 3 — no FOV yet).
- Stub `config/tiles.js` + `config/clouds.js` with entries for the types we draw.
- Replace `resizeCanvas` with a `#game-view`-relative sizer.
- Adapter holds `VisualState`; `apply(event)` mutates it; internal RAF draws 60 Hz.
- `mount.ts` still uses `setTimeout` for event pacing (testable with fake timers).
- Unit-test the adapter with a fake Samples renderer (record calls to `render` +
  snapshot `VisualState` mutations per event).

Flag if any of the above is wrong before I cut code.
