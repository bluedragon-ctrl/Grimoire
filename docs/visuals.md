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

Monster sprites live in `MONSTER_RENDERERS` (`src/render/monsters.ts`).
Each `MonsterTemplate.visual` in `src/content/monsters.ts` must be a key in `MONSTER_VISUALS`
(`src/content/visuals.ts`), which in turn maps to `MONSTER_RENDERERS`. Both layers are
validated at startup — a missing key throws before the first frame renders.

Current template → sprite assignments:

| template | visual (sprite key) | notes |
|---|---|---|
| `goblin`   | `skeleton`    | No goblin sprite yet; uses skeleton as stand-in |
| `skeleton` | `skeleton`    | |
| `bat`      | `bat`         | |
| `cultist`  | `dark_wizard` | |
| `slime`    | `slime`       | |

---

## Monster visual catalog (`MONSTER_VISUALS`)

Source: `src/content/visuals.ts`. Renderer implementations: `src/render/vendor/ui/render-monsters.js`.

| key | primary color slots | source |
|---|---|---|
| `skeleton`          | skull, torso, limbs (`#ccbb99`)        | render-monsters.js |
| `slime`             | body `#44dd44`, eyes `#88ff66`         | render-monsters.js |
| `ghost`             | shroud `#8899cc`, eyes `#bbccee`       | render-monsters.js |
| `dragon`            | head/body `#ff4422`, wings `#ff8855`   | render-monsters.js |
| `knight`            | helmet/plate/limbs `#aabbcc`           | render-monsters.js |
| `zombie`            | flesh `#88aa66`, rags `#556644`        | render-monsters.js |
| `spider`            | body `#222244`, eyes `#ff2200`         | render-monsters.js |
| `bat`               | body `#553366`, eyes `#ff4466`         | render-monsters.js |
| `wraith`            | form `#334466`, core `#6688ff`         | render-monsters.js |
| `golem`             | stone `#667788`, bolt `#44aaff`        | render-monsters.js |
| `orc_warrior`       | skin `#44aa55`, armor `#887766`        | render-monsters.js |
| `orc_knight`        | skin `#44aa55`, plate `#bbccdd`        | render-monsters.js |
| `orc_mage`          | skin `#44aa55`, magic `#aaff66`        | render-monsters.js |
| `dark_wizard`       | robe `#220033`, magic `#ff22ff`        | render-monsters.js |
| `rat`               | body `#887766`, eyes `#ff2200`         | render-monsters.js |
| `troll`             | hide `#557755`, eyes `#ffcc00`         | render-monsters.js |
| `vampire`           | cape `#220011`, face `#ddeeff`         | render-monsters.js |
| `mushroom`          | cap `#cc4422`, stalk `#ddcc99`         | render-monsters.js |
| `gargoyle`          | stone `#778899`, eyes `#ff4400`        | render-monsters.js |
| `lich`              | robe `#1a0033`, skull `#ccddaa`        | render-monsters.js |
| `serpent`           | scales `#227744`, eyes `#ffee00`       | render-monsters.js |
| `wisp`              | core `#aaddff`, halo `#5588bb`         | render-monsters.js |
| `skeleton_archer`   | skull/limbs `#ccbb99`, bow `#aa8833`   | render-monsters.js |
| `crystal_elemental` | crystal `#88ccff`, core `#eeffff`      | render-monsters.js |
| `fire_elemental`    | flame `#ff4400`, ember `#ff8800`       | render-monsters.js |
| `water_elemental`   | water `#2255aa`, foam `#66aadd`        | render-monsters.js |
| `air_elemental`     | wind `#aaccee`, core `#ffffff`         | render-monsters.js |
| `earth_elemental`   | stone `#887755`, lava `#ff8833`        | render-monsters.js |
| `giant_snail`       | shell `#aa7733`, body `#88aa44`        | render-monsters.js |

---

## Tile visual catalog (`TILE_VISUALS`)

Source: `src/content/visuals.ts`. Renderer implementations: `src/render/tiles.ts`.
Color slots: `col1` = boundary/structure, `col2` = decorative content.

| key | col1 | col2 | notes |
|---|---|---|---|
| `floor`           | `#804400` | — | |
| `floor_cracked`   | `#1a1000` | `#2a1800` | crack lines |
| `floor_mosaic`    | `#1a1000` | `#443300` | diamond pattern |
| `floor_dirt`      | `#1a1000` | `#2e1800` | pebble dots |
| `floor_mossy`     | `#804400` | `#446633` | moss blobs |
| `floor_rune`      | `#1a1000` | `#5522aa` | pentagram glyph |
| `wall`            | `#ff8800` | — | |
| `wall_rough`      | `#ff8800` | — | irregular lines |
| `wall_reinforced` | `#ff8800` | `#667788` | rivets |
| `wall_mossy`      | `#ff8800` | `#446633` | moss vines |
| `wall_cyclopean`  | `#ff8800` | — | massive blocks |
| `wall_cave`       | `#ff8800` | — | jagged outline |
| `door_closed`     | `#ff8800` | `#667788` | arched door |
| `door_open`       | `#ff8800` | `#0a0500` | open archway |
| `stairs_down`     | `#cc6d00` | — | radial spiral |
| `stairs_up`       | `#ff8800` | — | radial spiral |

---

## Object visual catalog (`OBJECT_VISUALS`)

Source: `src/content/visuals.ts`. Renderer implementations: `src/render/objects.ts`.

| key | primary color slots | notes |
|---|---|---|
| `chest`           | body `#cc9933`, lock `#ffcc44`      | |
| `shrine`          | stone `#887766`, glow `#ffcc44`     | pulsing cross |
| `fountain`        | stone `#778899`, water `#44aadd`    | animated jets |
| `fountain_health` | stone `#887766`, water `#dd4444`    | red water |
| `fountain_mana`   | stone `#778899`, water `#44aadd`    | blue water |
| `throne`          | wood `#6b3a1f`, accent `#cc9922`    | crown crest |
| `door_closed`     | col1 `#ff8800`, col2 `#667788`      | same draw as tile |
| `door_open`       | col1 `#ff8800`, col2 `#0a0500`      | same draw as tile |
| `stairs_down`     | col1 `#cc6d00`                      | |
| `stairs_up`       | col1 `#ff8800`                      | |
| `trap_spike`      | col1 `#554433`, col2 `#aaaaaa`      | |
| `trap_poison_spike` | col1 `#334422`, col2 `#55aa22`    | |
| `trap_bear_trap`  | col1 `#553322`, col2 `#776655`      | |
| `trap_fire`       | col1 `#443322`, col2 `#ff6600`      | |
| `trap_cold`       | col1 `#334455`, col2 `#88ccff`      | |
| `trap_steam`      | col1 `#556655`, col2 `#cccccc`      | |
| `trap_lightning`  | col1 `#221144`, col2 `#ffff44`      | |
| `trap_teleport`   | col1 `#332244`, col2 `#cc44ff`      | |
| `trap_mana_burn`  | col1 `#223344`, col2 `#44aaff`      | |
| `trap_weaken`     | col1 `#334433`, col2 `#aa4422`      | |

---

## How to add a new visual

### Reusing an existing draw function (most common)

Add an entry to the relevant `*_VISUALS` catalog in `src/content/visuals.ts`:

```ts
// New monster variant that reuses the skeleton sprite
MONSTER_VISUALS.undead_knight = {
  renderer: "skeleton",
  category: "monster",
  defaultColors: { skull: "#aaaaaa", torso: "#445577", limbs: "#445577" },
};
```

No renderer edits needed. The validation pass will verify the `renderer` key exists.

### Authoring a new draw function

New draw functions (genuinely new shapes) are out of scope for Phase 12.6. Flag in the
content backlog with the desired shape description. When authored:

1. Add the draw function to the appropriate typed file (`src/render/monsters.ts`, etc.).
2. Add it to the matching `*_RENDERERS` map.
3. Add a `*_VISUALS` catalog entry.
4. Add a smoke test assertion in `tests/render/asset-library.test.ts`.

---

## How to use a visual in content

### Monster template

```ts
// src/content/monsters.ts
MONSTER_TEMPLATES.lich_king = {
  id: "lich_king",
  name: "Lich King",
  visual: "lich",          // key in MONSTER_VISUALS → MONSTER_RENDERERS.lich
  colors: { robe: "#000033", staff: "#ff00ff" },
  stats: { hp: 80, maxHp: 80, speed: 10, atk: 6, int: 10, mp: 60, maxMp: 60 },
  ai: LICH_KING_AI,
};
```

### Tile declaration (Phase 14 dungeon-gen)

```ts
// Phase 14 — themed room
const room = {
  tiles: [
    [{ kind: "wall_cyclopean" }, { kind: "floor_mossy" }, ...],
  ],
  objects: [
    { kind: "shrine",     pos: { x: 5, y: 5 } },
    { kind: "stairs_down", pos: { x: 8, y: 8 } },
  ],
};
```

### Room-gen snippet (Phase 14)

```ts
import { TILE_VISUALS } from "../content/visuals.js";

// Pick a themed tile set for a dungeon level
const themeFloor = "floor_mossy";
const themeWall  = "wall_cyclopean";
// Validate both exist before building the room
if (!TILE_VISUALS[themeFloor] || !TILE_VISUALS[themeWall]) {
  throw new Error("Unknown tile theme");
}
```
