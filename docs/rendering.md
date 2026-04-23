# Phase 8 — rendering pipeline

End-to-end map from engine events → pixels, plus notes on the canvas draws
ported from the `Samples/` prototype and the prep-phase inventory panel.

## 1. Architecture at a glance

```
engine (GameEvent[])
      │
      ▼
WireRendererAdapter.apply(event)          (src/render/wire-adapter.ts)
  │   - mutates VisualState: player/monsters/clouds/activeEffects
  │   - looks up PROJECTILE_PRESETS / BURST_PRESETS / CLOUD_PRESETS / overlay map
  │
  ▼
frame loop (requestAnimationFrame, 60 Hz)
  │   - advances each activeEffect's `elapsed` by frameDt
  │   - drops expired effects; prunes dead monsters after grace
  │
  ▼
vendorRender(state)                       (src/render/vendor/ui/renderer.js)
  │   - draws tiles, entities, monsters, items, clouds
  │   - dispatches state.activeEffects via drawEffect(name, params, t, colors)
  │
  ▼
canvas pixels
```

The adapter is the *only* stateful translator between the engine and the
renderer. Everything else is pure draw code.

## 2. Pure-pixel draws (8.0 port)

Ported from `Samples/ui/render-*.js` into strict TypeScript:

| file | responsibility | exports |
|---|---|---|
| `src/render/context.ts` | palette + helpers | `TILE`, `C`, `lighten`, `darken`, `wire(ctx, color, glow?)` |
| `src/render/prims.ts`   | batched canvas primitives | `dots`, `eyePair`, `lines`, `poly`, `zigzag`, `orbit` |
| `src/render/items.ts`   | per-item silhouettes | 25 `drawXxx` + `ITEM_DRAWS` registry |
| `src/render/effects.ts` | projectile/area/cloud/overlay FX | 15 draws + `EFFECT_KIND`, `EFFECT_DURATION`, `EFFECT_RENDERERS`, `drawEffect` |

All functions are pure — they take a `CanvasRenderingContext2D`, world-space
coordinates, and a time parameter. They never read or write DOM, never touch
timers. This is what makes the smoke-test approach viable: `tests/render/draws.test.ts`
runs every exported draw against `makeCanvasMock()` (a no-op stub) and asserts
nothing throws.

### The `wire()` primitive
`wire(ctx, color, glow = 6)` sets `strokeStyle + shadowColor + shadowBlur`
in one call. Every visual in the port uses it; one `shadowBlur > 0` plus one
`stroke()` per beginPath batch is how the neon look stays cheap.

### Engine-coupled draws (deferred)
The original `Samples/` codebase also had `render-tiles.js`, `render-entities.js`,
`render-monsters.js`, `render-objects.js` — those couple tightly to world
structure and were **not** ported in 8.0. The vendored bundle under
`src/render/vendor/ui/` still provides them; Phase 8 leaves the vendor as the
authoritative implementation and relies on our ported modules only for
items and effects.

## 3. Adapter event wiring

`WireRendererAdapter.apply(event)` is a switch over every `GameEvent.type`.
Phase 3 handled movement/combat/casts; Phase 8 added presets + Phase 5/6/7
events.

| event | effect pushed | preset source |
|---|---|---|
| `Moved` | — (mutates position) | — |
| `Attacked` / `Hit` | area `explosion` at target | — |
| `Cast` | projectile from src→tgt, shape from preset | `PROJECTILE_PRESETS[visual]` → `ELEMENT_DEFAULTS[element]` |
| `Healed` | overlay `healing` on actor | — |
| `Died` / `HeroDied` | area `deathBurst` | — |
| `HeroExited` | overlay `sparkling` on hero | — |
| `EffectApplied` | status overlay (burning / dripping / healing / sparkling / cloudWavy) | `overlayForEffect(kind)` |
| `EffectExpired` | drops the matching overlay by `effectKind` tag | — |
| `CloudSpawned` | adds a `VisualCloud` to `state.clouds` | `CLOUD_PRESETS[visual]` |
| `CloudExpired` | removes the cloud by id | — |
| `VisualBurst` | area `blobExplosion` at `pos` | `BURST_PRESETS[visual]` → element fallback |
| `ItemUsed` | overlay `sparkling` on actor | — |
| `OnHitTriggered` | small area `blobExplosion` at defender | — |
| `ItemEquipped` / `ItemUnequipped` | no canvas effect — inventory UI refreshes | — |
| `Missed`, `Waited`, `Halted`, `Idled`, `ActionFailed`, `See` | log-only | — |

### Preset resolvers
- `resolveProjectile(visual, element)` — direct lookup, then element default.
- `resolveBurst(visual, element)` — direct lookup, then element→canonical burst map.
- `overlayForEffect(kind)` — fixed per-`EffectKind` map with fallback colors.

All resolvers accept undefined inputs and return `undefined` rather than
throwing — unknown visuals degrade to the adapter's fallback colors.

### Effect lifecycle
Each entry in `activeEffects` carries `elapsed / duration`. The frame loop
drops entries whose `elapsed >= duration`. Status overlays use a long nominal
duration (`D_STATUS = 999`) plus an `effectKind` tag so `EffectExpired` can
drop them explicitly.

Clouds live in `state.clouds` (not `activeEffects`) because the vendor
renderer draws them per-tile with its own alpha-fade logic and FOV gating.

## 4. Prep-phase inventory panel

Visible only in `idle` (pre-Run) and `done` (post-Run review) modes;
`playing` and `paused` hide the inventory row.

```
┌─────────────────────────────────────────────────────┐
│ Equipment                                           │
│ [hat ][robe][staff][dagger][focus]                  │
│                                                     │
│ Bag                                                 │
│ [slot1][slot2][slot3][slot4]                        │
└─────────────────────────────────────────────────────┘
```

- `src/ui/inventory.ts` renders each slot as a 64px button containing a
  small canvas (drawn via `ITEM_DRAWS` + `ITEM_VISUAL_PRESETS` colors) and
  a name caption.
- Clicking an equipment slot opens a picker filtered to
  `category === "wearable" && slot === <slot>`. Clicking a bag slot picks
  among consumables.
- Selection mutates the prep `Actor.inventory` in place; the next `Run`
  starts the engine with those choices (engine clones on entry).
- `setEditable(false)` disables all buttons — used during `playing` and
  `done` to prevent mid-run edits.

### Layout toggles
`main.grid` has two independent modifier classes:
- `.no-inspector` — set unless `paused`; collapses the 3rd column.
- `.no-inventory` — set unless `idle`/`done`; collapses the middle row.

The combined `.no-inventory.no-inspector` rule ensures the classic
two-column editor/game+log layout still works during `playing`.

## 5. Testing

| layer | test | count |
|---|---|---|
| pure draws | `tests/render/draws.test.ts` | 45 |
| adapter (Phase 3 events) | `tests/render/wire-adapter.test.ts` | 8 |
| adapter (Phase 5/6/7 events) | `tests/render/wire-adapter.test.ts` | 6 |
| inventory panel | `tests/ui/inventory.test.ts` | 5 |

Draws are smoke-tested with `makeCanvasMock()` (no real canvas). The adapter
tests inject no-op `init/render/schedule/cancel` deps so no canvas or RAF
clock is touched — they drive `apply()` and assert on `getState()`.
Inventory tests run against happy-dom.

## 6. Known gaps / deferred work

- **Floor-item rendering.** `state.floorItems` is currently empty — the
  engine doesn't yet spawn ground items. When it does, the vendor renderer
  already supports `floorItems: [{ x, y, type, colors }]`, and the picker
  would flip to "Pick up" semantics.
- **Monster sprite variety.** `spriteForKind` maps every non-hero kind to
  `skeleton` because the vendored monster registry has no `goblin` entry.
  Adding a goblin sprite would land under the next content phase.
- **Per-cloud duration.** `CloudTicked` doesn't carry remaining ticks today,
  so the adapter tracks only spawned/expired. Cloud fade in the vendor
  renderer uses `duration / maxDuration`; we pass `{ duration: 1, maxDuration: 1 }`
  so clouds render fully opaque until expire — acceptable at current cloud
  lifetimes (≤ 3 ticks).
