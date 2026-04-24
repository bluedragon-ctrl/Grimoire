// Visual preset dicts. Data-only — NOT imported by the engine in Phase 6.
// The Phase 8 renderer will subscribe to Cast / CloudSpawned / VisualBurst,
// look up preset names in this file, and render accordingly. Event payloads
// carry `visual` (preset name) and `element` (element tag) so the engine
// emits zero visual decisions.

import type { EffectKind } from "../types.js";

export type ProjectileShape = "bolt" | "beam" | "zigzag" | "orbs" | "arrow" | "thrown";

export interface ProjectilePreset {
  projectile: ProjectileShape;
  colors: { color: string; color2: string };
}

export interface BurstPreset {
  burst: string;
  colors: { color: string; color2: string };
  /** Optional size hint for the renderer (e.g. explosion_fire_big). */
  size?: "big";
}

export interface CloudPreset {
  colors: { color: string; color2: string };
}

export interface EffectOverlayPreset {
  name: string;
  colors: { color: string; color2: string };
}

export const PROJECTILE_PRESETS: Record<string, ProjectilePreset> = Object.freeze({
  bolt_orange:   { projectile: "bolt",   colors: { color: "#ff6622", color2: "#ffdd66" } },
  bolt_red:      { projectile: "bolt",   colors: { color: "#ff3322", color2: "#ffaa33" } },
  bolt_blue:     { projectile: "bolt",   colors: { color: "#3366ff", color2: "#99ccff" } },
  bolt_green:    { projectile: "bolt",   colors: { color: "#44cc66", color2: "#aaffcc" } },
  bolt_gold:     { projectile: "bolt",   colors: { color: "#ffcc00", color2: "#ffffff" } },
  beam_frost:    { projectile: "beam",   colors: { color: "#66ccff", color2: "#ffffff" } },
  beam_arcane:   { projectile: "beam",   colors: { color: "#bb66ff", color2: "#ffffff" } },
  beam_violet:   { projectile: "beam",   colors: { color: "#bb44ff", color2: "#eeccff" } },
  zigzag_yellow: { projectile: "zigzag", colors: { color: "#ffff44", color2: "#ffffff" } },
  arrow_green:   { projectile: "arrow",  colors: { color: "#44cc66", color2: "#aaffcc" } },
  healing_green: { projectile: "bolt",   colors: { color: "#44cc66", color2: "#ccffcc" } },
  thrown_smoke:  { projectile: "thrown", colors: { color: "#666666", color2: "#aaaaaa" } },
});

export const BURST_PRESETS: Record<string, BurstPreset> = Object.freeze({
  // Phase 6 originals
  burst_ember:       { burst: "ember",       colors: { color: "#ff6622", color2: "#ffcc33" } },
  burst_frost:       { burst: "frost",       colors: { color: "#66ccff", color2: "#ffffff" } },
  burst_arcane:      { burst: "arcane",      colors: { color: "#bb66ff", color2: "#ffddff" } },
  // Phase 13.1 — explosion variants (reuse explosion draw fn, different tints)
  explosion_fire:     { burst: "explosion",  colors: { color: "#ff6622", color2: "#ffcc33" } },
  explosion_frost:    { burst: "explosion",  colors: { color: "#66ccff", color2: "#ffffff" } },
  explosion_shock:    { burst: "explosion",  colors: { color: "#ffff44", color2: "#ffffff" } },
  explosion_fire_big: { burst: "explosion",  colors: { color: "#ff4400", color2: "#ffcc00" }, size: "big" },
  // Phase 13.1 — self-cast visual bursts for buff spells
  sparkle_gold:  { burst: "sparkling", colors: { color: "#ffcc00", color2: "#ffee88" } },
  sparkle_red:   { burst: "sparkling", colors: { color: "#ff4422", color2: "#ffaa44" } },
  barrier_steel: { burst: "barrier",   colors: { color: "#99aabb", color2: "#ccd8e0" } },
  barrier_cyan:  { burst: "barrier",   colors: { color: "#44ccff", color2: "#aaeeff" } },
  healing_blue:  { burst: "healing",   colors: { color: "#4488ff", color2: "#aaddff" } },
});

export const CLOUD_PRESETS: Record<string, CloudPreset> = Object.freeze({
  cloud_fire:   { colors: { color: "#ff6622", color2: "#ffaa33" } },
  cloud_frost:  { colors: { color: "#66ccff", color2: "#ccffff" } },
  cloud_smoke:  { colors: { color: "#555555", color2: "#999999" } },
  cloud_poison: { colors: { color: "#33aa55", color2: "#aaff88" } },
});

// Element → default preset name. Used when a spell body omits `visual`
// but provides `element` — the renderer resolves via this map.
export const ELEMENT_DEFAULTS: Record<string, string> = Object.freeze({
  fire:   "bolt_orange",
  frost:  "beam_frost",
  arcane: "beam_arcane",
  smoke:  "thrown_smoke",
});

// Data-driven overlay map — replaces the switch in wire-adapter overlayForEffect.
// Every EffectKind must have an entry; missing keys are caught by visuals-validate.ts.
export const EFFECT_OVERLAY_PRESETS: Record<EffectKind, EffectOverlayPreset> = Object.freeze({
  // Phase 5 originals
  burning:   { name: "burning",   colors: { color: "#ff6622", color2: "#ffcc33" } },
  poison:    { name: "dripping",  colors: { color: "#33aa55", color2: "#aaff88" } },
  regen:     { name: "healing",   colors: { color: "#66ff99", color2: "#ccffcc" } },
  haste:     { name: "sparkling", colors: { color: "#ffff99", color2: "#ffffff" } },
  slow:      { name: "cloudWavy", colors: { color: "#6688aa", color2: "#aaccee" } },
  // Phase 13 additions
  chill:     { name: "cloudWavy", colors: { color: "#99ccee", color2: "#ddeeff" } },
  shock:     { name: "sparkling", colors: { color: "#ffff66", color2: "#ffffff" } },
  expose:    { name: "sparkling", colors: { color: "#ff44cc", color2: "#ffaadd" } },
  might:     { name: "sparkling", colors: { color: "#ff4422", color2: "#ffaa44" } },
  iron_skin: { name: "barrier",   colors: { color: "#99aabb", color2: "#ccd8e0" } },
  mana_regen:{ name: "healing",   colors: { color: "#4488ff", color2: "#aaddff" } },
  mana_burn: { name: "dripping",  colors: { color: "#8833aa", color2: "#dd88ff" } },
  power:     { name: "sparkling", colors: { color: "#ffcc00", color2: "#ffee88" } },
  shield:    { name: "barrier",   colors: { color: "#44ccff", color2: "#aaeeff" } },
});

// ── Visual asset catalogs ────────────────────────────────────────────────────
// Content-facing registries. A monster template declares  visual: "ghost" — the
// renderer looks up MONSTER_VISUALS["ghost"].renderer to find the draw function.
// Phase 13 content and Phase 14 dungeon-gen consume these; the renderer never
// needs to change for entries that reuse existing draw functions.

/** One entry in a visual catalog. `renderer` is the key into the matching
 *  *_RENDERERS map. `defaultColors` mirrors the draw function's internal defaults
 *  so content authors can see available slots without reading the draw code. */
export interface VisualSpec {
  renderer: string;
  defaultColors?: Record<string, string>;
  category: "monster" | "tile" | "item" | "object";
}

// ── Monster visuals ──────────────────────────────────────────────────────────

export const MONSTER_VISUALS: Record<string, VisualSpec> = Object.freeze({
  skeleton:          { renderer: "skeleton",          category: "monster", defaultColors: { skull: "#ccbb99", torso: "#ccbb99", limbs: "#ccbb99" } },
  slime:             { renderer: "slime",             category: "monster", defaultColors: { body: "#44dd44", eyes: "#88ff66", drip: "#44dd44" } },
  ghost:             { renderer: "ghost",             category: "monster", defaultColors: { shroud: "#8899cc", eyes: "#bbccee", wisp: "#667799" } },
  dragon:            { renderer: "dragon",            category: "monster", defaultColors: { head: "#ff4422", body: "#ff4422", wings: "#ff8855" } },
  knight:            { renderer: "knight",            category: "monster", defaultColors: { helmet: "#aabbcc", plate: "#aabbcc", limbs: "#aabbcc" } },
  zombie:            { renderer: "zombie",            category: "monster", defaultColors: { flesh: "#88aa66", rot: "#445533", rags: "#556644" } },
  spider:            { renderer: "spider",            category: "monster", defaultColors: { body: "#222244", legs: "#334455", eyes: "#ff2200" } },
  bat:               { renderer: "bat",               category: "monster", defaultColors: { body: "#553366", wings: "#442255", eyes: "#ff4466" } },
  wraith:            { renderer: "wraith",            category: "monster", defaultColors: { form: "#334466", tendrils: "#223355", core: "#6688ff" } },
  golem:             { renderer: "golem",             category: "monster", defaultColors: { stone: "#667788", eyes: "#88ffcc", bolt: "#44aaff" } },
  orc_warrior:       { renderer: "orc_warrior",       category: "monster", defaultColors: { skin: "#44aa55", armor: "#887766", weapon: "#aabbcc" } },
  orc_knight:        { renderer: "orc_knight",        category: "monster", defaultColors: { skin: "#44aa55", plate: "#bbccdd", shield: "#aa3322" } },
  orc_mage:          { renderer: "orc_mage",          category: "monster", defaultColors: { skin: "#44aa55", robe: "#335522", magic: "#aaff66" } },
  dark_wizard:       { renderer: "dark_wizard",       category: "monster", defaultColors: { robe: "#220033", staff: "#aa6633", magic: "#ff22ff" } },
  rat:               { renderer: "rat",               category: "monster", defaultColors: { body: "#887766", tail: "#665544", eyes: "#ff2200" } },
  troll:             { renderer: "troll",             category: "monster", defaultColors: { hide: "#557755", eyes: "#ffcc00", face: "#446644" } },
  vampire:           { renderer: "vampire",           category: "monster", defaultColors: { cape: "#220011", face: "#ddeeff", eyes: "#ff0033" } },
  mushroom:          { renderer: "mushroom",          category: "monster", defaultColors: { cap: "#cc4422", stalk: "#ddcc99", spores: "#ffeeaa" } },
  gargoyle:          { renderer: "gargoyle",          category: "monster", defaultColors: { stone: "#778899", wings: "#556677", eyes: "#ff4400" } },
  lich:              { renderer: "lich",              category: "monster", defaultColors: { robe: "#1a0033", skull: "#ccddaa", staff: "#8833ff" } },
  serpent:           { renderer: "serpent",           category: "monster", defaultColors: { scales: "#227744", hood: "#33aa55", eyes: "#ffee00" } },
  wisp:              { renderer: "wisp",              category: "monster", defaultColors: { core: "#aaddff", halo: "#5588bb", sparks: "#eeffff" } },
  skeleton_archer:   { renderer: "skeleton_archer",   category: "monster", defaultColors: { skull: "#ccbb99", limbs: "#ccbb99", bow: "#aa8833" } },
  crystal_elemental: { renderer: "crystal_elemental", category: "monster", defaultColors: { crystal: "#88ccff", core: "#eeffff", edge: "#4488bb" } },
  fire_elemental:    { renderer: "fire_elemental",    category: "monster", defaultColors: { flame: "#ff4400", ember: "#ff8800", core: "#ffdd00" } },
  water_elemental:   { renderer: "water_elemental",   category: "monster", defaultColors: { water: "#2255aa", foam: "#66aadd", core: "#aaddff" } },
  air_elemental:     { renderer: "air_elemental",     category: "monster", defaultColors: { wind: "#aaccee", mist: "#ddeeff", core: "#ffffff" } },
  earth_elemental:   { renderer: "earth_elemental",   category: "monster", defaultColors: { stone: "#887755", crack: "#553322", lava: "#ff8833" } },
  giant_snail:       { renderer: "giant_snail",       category: "monster", defaultColors: { shell: "#aa7733", body: "#88aa44", eyes: "#ffee44" } },
});

// ── Tile visuals ─────────────────────────────────────────────────────────────

export const TILE_VISUALS: Record<string, VisualSpec> = Object.freeze({
  floor:           { renderer: "floor",           category: "tile", defaultColors: { col1: "#804400" } },
  floor_cracked:   { renderer: "floor_cracked",   category: "tile", defaultColors: { col1: "#1a1000", col2: "#2a1800" } },
  floor_mosaic:    { renderer: "floor_mosaic",    category: "tile", defaultColors: { col1: "#1a1000", col2: "#443300" } },
  floor_dirt:      { renderer: "floor_dirt",      category: "tile", defaultColors: { col1: "#1a1000", col2: "#2e1800" } },
  floor_mossy:     { renderer: "floor_mossy",     category: "tile", defaultColors: { col1: "#804400", col2: "#446633" } },
  floor_rune:      { renderer: "floor_rune",      category: "tile", defaultColors: { col1: "#1a1000", col2: "#5522aa" } },
  wall:            { renderer: "wall",            category: "tile", defaultColors: { col1: "#ff8800" } },
  wall_rough:      { renderer: "wall_rough",      category: "tile", defaultColors: { col1: "#ff8800" } },
  wall_reinforced: { renderer: "wall_reinforced", category: "tile", defaultColors: { col1: "#ff8800", col2: "#667788" } },
  wall_mossy:      { renderer: "wall_mossy",      category: "tile", defaultColors: { col1: "#ff8800", col2: "#446633" } },
  wall_cyclopean:  { renderer: "wall_cyclopean",  category: "tile", defaultColors: { col1: "#ff8800" } },
  wall_cave:       { renderer: "wall_cave",       category: "tile", defaultColors: { col1: "#ff8800" } },
  door_closed:     { renderer: "door_closed",     category: "tile", defaultColors: { col1: "#ff8800", col2: "#667788" } },
  door_open:       { renderer: "door_open",       category: "tile", defaultColors: { col1: "#ff8800", col2: "#0a0500" } },
  stairs_down:     { renderer: "stairs_down",     category: "tile", defaultColors: { col1: "#cc6d00" } },
  stairs_up:       { renderer: "stairs_up",       category: "tile", defaultColors: { col1: "#ff8800" } },
});

// ── Object visuals ───────────────────────────────────────────────────────────

export const OBJECT_VISUALS: Record<string, VisualSpec> = Object.freeze({
  chest:           { renderer: "chest",           category: "object", defaultColors: { body: "#cc9933", bands: "#667788", lock: "#ffcc44" } },
  shrine:          { renderer: "shrine",          category: "object", defaultColors: { stone: "#887766", glow: "#ffcc44" } },
  fountain:        { renderer: "fountain",        category: "object", defaultColors: { stone: "#778899", water: "#44aadd" } },
  fountain_health: { renderer: "fountain_health", category: "object", defaultColors: { stone: "#887766", water: "#dd4444" } },
  fountain_mana:   { renderer: "fountain_mana",   category: "object", defaultColors: { stone: "#778899", water: "#44aadd" } },
  throne:          { renderer: "throne",          category: "object", defaultColors: { wood: "#6b3a1f", accent: "#cc9922" } },
  door_closed:     { renderer: "door_closed",     category: "object", defaultColors: { col1: "#ff8800", col2: "#667788" } },
  door_open:       { renderer: "door_open",       category: "object", defaultColors: { col1: "#ff8800", col2: "#0a0500" } },
  stairs_down:     { renderer: "stairs_down",     category: "object", defaultColors: { col1: "#cc6d00" } },
  stairs_up:       { renderer: "stairs_up",       category: "object", defaultColors: { col1: "#ff8800" } },
  trap_spike:        { renderer: "trap_spike",        category: "object", defaultColors: { col1: "#554433", col2: "#aaaaaa" } },
  trap_poison_spike: { renderer: "trap_poison_spike", category: "object", defaultColors: { col1: "#334422", col2: "#55aa22" } },
  trap_bear_trap:    { renderer: "trap_bear_trap",    category: "object", defaultColors: { col1: "#553322", col2: "#776655" } },
  trap_fire:         { renderer: "trap_fire",         category: "object", defaultColors: { col1: "#443322", col2: "#ff6600" } },
  trap_cold:         { renderer: "trap_cold",         category: "object", defaultColors: { col1: "#334455", col2: "#88ccff" } },
  trap_steam:        { renderer: "trap_steam",        category: "object", defaultColors: { col1: "#556655", col2: "#cccccc" } },
  trap_lightning:    { renderer: "trap_lightning",    category: "object", defaultColors: { col1: "#221144", col2: "#ffff44" } },
  trap_teleport:     { renderer: "trap_teleport",     category: "object", defaultColors: { col1: "#332244", col2: "#cc44ff" } },
  trap_mana_burn:    { renderer: "trap_mana_burn",    category: "object", defaultColors: { col1: "#223344", col2: "#44aaff" } },
  trap_weaken:       { renderer: "trap_weaken",       category: "object", defaultColors: { col1: "#334433", col2: "#aa4422" } },
});

// ── Item visuals ─────────────────────────────────────────────────────────────

export const ITEM_VISUALS: Record<string, VisualSpec> = Object.freeze({
  mana_crystal:      { renderer: "mana_crystal",      category: "item", defaultColors: { color: "#66aaff" } },
  health_potion:     { renderer: "health_potion",     category: "item", defaultColors: { color: "#ff4444" } },
  sword:             { renderer: "sword",             category: "item", defaultColors: { blade: "#55bbff", guard: "#ffcc44", hilt: "#cc9933" } },
  key:               { renderer: "key",               category: "item" },
  potion_1:          { renderer: "potion_1",          category: "item" },
  potion_2:          { renderer: "potion_2",          category: "item" },
  potion_of_fury:    { renderer: "potion_of_fury",    category: "item" },
  potion_of_warding: { renderer: "potion_of_warding", category: "item" },
  potion_of_focus:   { renderer: "potion_of_focus",   category: "item" },
  wooden_staff:      { renderer: "wooden_staff",      category: "item" },
  fire_staff:        { renderer: "fire_staff",        category: "item" },
  iron_staff:        { renderer: "iron_staff",        category: "item" },
  shock_staff:       { renderer: "shock_staff",       category: "item" },
  draining_staff:    { renderer: "draining_staff",    category: "item" },
  crystal_staff:     { renderer: "crystal_staff",     category: "item" },
  leather_robe:      { renderer: "leather_robe",      category: "item" },
  silk_robe:         { renderer: "silk_robe",         category: "item" },
  ember_robe:        { renderer: "ember_robe",        category: "item" },
  chain_vestment:    { renderer: "chain_vestment",    category: "item" },
  archmage_robe:     { renderer: "archmage_robe",     category: "item" },
  shadow_cloak:      { renderer: "shadow_cloak",      category: "item" },
  bone_dagger:       { renderer: "bone_dagger",       category: "item" },
  steel_dagger:      { renderer: "steel_dagger",      category: "item" },
  venom_dagger:      { renderer: "venom_dagger",      category: "item" },
  shadow_blade:      { renderer: "shadow_blade",      category: "item" },
  frost_shard:       { renderer: "frost_shard",       category: "item" },
  warblade:          { renderer: "warblade",          category: "item" },
  quartz_focus:      { renderer: "quartz_focus",      category: "item" },
  runed_focus:       { renderer: "runed_focus",       category: "item" },
  void_focus:        { renderer: "void_focus",        category: "item" },
  bloodstone:        { renderer: "bloodstone",        category: "item" },
  star_fragment:     { renderer: "star_fragment",     category: "item" },
  prism_shard:       { renderer: "prism_shard",       category: "item" },
  cloth_cap:         { renderer: "cloth_cap",         category: "item" },
  wizard_hat:        { renderer: "wizard_hat",        category: "item" },
  scholar_circlet:   { renderer: "scholar_circlet",   category: "item" },
  iron_helm:         { renderer: "iron_helm",         category: "item" },
  arcane_cowl:       { renderer: "arcane_cowl",       category: "item" },
  crown_of_ages:     { renderer: "crown_of_ages",     category: "item" },
  trap_1:            { renderer: "trap_1",            category: "item" },
  trap_2:            { renderer: "trap_2",            category: "item" },
  trap_3:            { renderer: "trap_3",            category: "item" },
});
