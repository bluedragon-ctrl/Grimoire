# Visual preset catalog

Complete reference for all effect presets in `src/content/visuals.ts`. The renderer reads
these via `WireRendererAdapter` (`src/render/wire-adapter.ts`); the validation module
(`src/content/visuals-validate.ts`) asserts at engine startup that every content entry
resolves to a known preset.

---

## Projectile presets (`PROJECTILE_PRESETS`)

Used by `Cast` events. Each entry maps to a draw function from `src/render/effects.ts`.

| name | shape | primary color | secondary color | used by |
|---|---|---|---|---|
| `bolt_orange` | bolt | `#ff6622` | `#ffdd66` | `bolt` spell (arcane fallback) |
| `bolt_red`    | bolt | `#ff3322` | `#ffaa33` | `firebolt` spell |
| `bolt_blue`   | bolt | `#3366ff` | `#99ccff` | *(reserved)* |
| `bolt_green`  | bolt | `#44cc66` | `#aaffcc` | `heal` spell |
| `bolt_gold`   | bolt | `#ffcc00` | `#ffffff` | `bless` spell |
| `beam_frost`  | beam | `#66ccff` | `#ffffff` | `chill` spell |
| `beam_arcane` | beam | `#bb66ff` | `#ffffff` | arcane element default |
| `thrown_smoke`| thrown | `#666666` | `#aaaaaa` | smoke element default |

**Shape draw functions** (all in `src/render/effects.ts`):

| shape | draw function | notes |
|---|---|---|
| `bolt` | `drawBolt` | Short glowing core with trailing spark |
| `beam` | `drawBeam` | Full-length sustained ray |
| `zigzag` | `drawZigzag` | Lightning-style path |
| `orbs` | `drawOrbs` | Orbiting particle cluster |
| `arrow` | `drawArrow` | Physical arrow silhouette |
| `thrown` | `drawThrown` | Tumbling object |

---

## Burst presets (`BURST_PRESETS`)

Used by `VisualBurst` events (from `explode` ops and combat impacts).

| name | draw function | primary color | secondary color | notes |
|---|---|---|---|---|
| `burst_ember`  | `drawBlobExplosion` | `#ff6622` | `#ffcc33` | fire explosion |
| `burst_frost`  | `drawBlobExplosion` | `#66ccff` | `#ffffff` | ice shatter |
| `burst_arcane` | `drawBlobExplosion` | `#bb66ff` | `#ffddff` | arcane pop |

---

## Cloud presets (`CLOUD_PRESETS`)

Used by `CloudSpawned` events. Rendered per-tile via `drawCloudWavy`.

| name | primary color | secondary color | used by |
|---|---|---|---|
| `cloud_fire`  | `#ff6622` | `#ffaa33` | `fire` cloud kind / `firewall` spell |
| `cloud_frost` | `#66ccff` | `#ccffff` | `frost` cloud kind |
| `cloud_smoke` | `#555555` | `#999999` | smoke element default |

---

## Effect overlay presets (`EFFECT_OVERLAY_PRESETS`)

Data-driven registry keyed by `EffectKind`. Used by `EffectApplied` events. Every
`EffectKind` must have an entry — missing keys cause a throw at engine startup.

| EffectKind | overlay draw | primary color | secondary color |
|---|---|---|---|
| `burning` | `drawBurning`   | `#ff6622` | `#ffcc33` |
| `poison`  | `drawDripping`  | `#33aa55` | `#aaff88` |
| `regen`   | `drawHealing`   | `#66ff99` | `#ccffcc` |
| `haste`   | `drawSparkling` | `#ffff99` | `#ffffff` |
| `slow`    | `drawCloudWavy` | `#6688aa` | `#aaccee` |

---

## Element defaults (`ELEMENT_DEFAULTS`)

Fallback preset names when a spell op supplies `element` but no explicit `visual`.

| element | default preset |
|---|---|
| `fire`   | `bolt_orange` |
| `frost`  | `beam_frost`  |
| `arcane` | `beam_arcane` |
| `smoke`  | `thrown_smoke`|

---

## How to add a new spell visual

1. **Pick or add a preset.** If an existing preset fits, use it. To add a new color
   variant, append an entry to `PROJECTILE_PRESETS` in `src/content/visuals.ts` using
   one of the 6 existing `ProjectileShape` values — no new draw functions needed.

2. **Wire the spell op.** In `src/content/spells.ts`, add `visual: "<preset_name>"`
   (and optionally `element: "<element>"`) to the op's `args`:
   ```ts
   { op: "project", args: { damage: 4, visual: "bolt_green", element: "arcane" } }
   ```
   `castSpell()` reads `firstOp.args.visual` and surfaces it on the `Cast` event.

3. **For clouds**, add `visual: "cloud_<name>"` to the `spawn_cloud` op *and* to
   the `CLOUD_KINDS` entry (`src/content/clouds.ts`) so the kind is self-describing.

4. **Validation is automatic.** `src/content/visuals-validate.ts` runs at engine
   startup (imported by `wire-adapter.ts`) and throws if any preset key is unknown.
   A missing or misspelled preset is caught before the first frame renders.

---

## Monster sprite registry

Monster sprites live in `MONSTER_RENDERERS` (`src/render/vendor/ui/render-entities.js`).
Each `MonsterTemplate.visual` in `src/content/monsters.ts` must be a key in that map.
`spriteForActor()` in `wire-adapter.ts` reads `actor.visual` (stamped by `createActor`)
then falls back to `MONSTER_TEMPLATES[kind].visual`. Both paths are validated at startup.

Current template → sprite assignments:

| template | visual (sprite key) | notes |
|---|---|---|
| `goblin`   | `skeleton`    | No goblin sprite yet; uses skeleton as stand-in |
| `skeleton` | `skeleton`    | |
| `bat`      | `bat`         | |
| `cultist`  | `dark_wizard` | |
| `slime`    | `slime`       | |
