# Rendering pipeline

End-to-end map from engine events → pixels, plus notes on the canvas draws
and the prep-phase inventory panel.

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

## 2. Pure-pixel draws

Strict TypeScript modules:

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

### Engine-coupled draws
Tile, entity, monster, and object draws couple tightly to world structure and
live in the vendored bundle under `src/render/vendor/ui/`. The vendor is the
authoritative implementation for those; the ported modules above cover items
and effects only.

## 3. Adapter event wiring

`WireRendererAdapter.apply(event)` is a switch over every `GameEvent.type`.

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

Visible only during `loadout` (pre-attempt) and the post-attempt review
screens; `running` and `paused` hide the inventory row.

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
- Selection mutates the prep `Actor.inventory` in place; `startAttempt()`
  builds a fresh hero from the persistent run + loadout (engine clones on entry).
- `setEditable(false)` disables all buttons — used outside `loadout` to
  prevent mid-run edits.

### Layout toggles
`main.grid` has two independent modifier classes:
- `.no-inspector` — set unless `paused`; collapses the 3rd column.
- `.no-inventory` — set unless `loadout`/recap-screens; collapses the middle row.

The combined `.no-inventory.no-inspector` rule ensures the classic
two-column editor/game+log layout still works during `running`.

## 5. Testing

| layer | test |
|---|---|
| pure draws | [tests/render/draws.test.ts](../tests/render/draws.test.ts) |
| adapter event wiring | [tests/render/wire-adapter.test.ts](../tests/render/wire-adapter.test.ts) |
| inventory panel | [tests/ui/inventory.test.ts](../tests/ui/inventory.test.ts) |

Draws are smoke-tested with `makeCanvasMock()` (no real canvas). The adapter
tests inject no-op `init/render/schedule/cancel` deps so no canvas or RAF
clock is touched — they drive `apply()` and assert on `getState()`.
Inventory tests run against happy-dom.

## 6. Known gaps

- **Per-cloud duration.** `CloudSpawned` payload carries the engine's
  declared duration but the adapter currently passes `duration: 1` to
  `state.clouds`. Cloud fade in the vendor renderer uses
  `duration / maxDuration`, so clouds render fully opaque until expire.
  Acceptable at current cloud lifetimes (≤ 3 ticks); read from the event
  to fix.
