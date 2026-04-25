// ITEM_VISUAL_PRESETS — data-only. Phase 7 does not draw items; the Phase 8
// renderer consumes these presets keyed by ItemDef.visualPreset (default = id).
// Shape enumerates the silhouette family; colors are hex strings (single
// `color` for monochrome, `col1`/`col2` for two-tone).

export type ItemShape =
  | "potion" | "crystal" | "scroll"
  | "staff" | "robe" | "hat" | "dagger" | "focus";

export interface ItemVisualPreset {
  shape: ItemShape;
  colors: { color?: string; col1?: string; col2?: string };
}

export const ITEM_VISUAL_PRESETS: Record<string, ItemVisualPreset> = Object.freeze({
  // Flat consumables
  health_potion:      { shape: "potion",  colors: { col1: "#cc1133", col2: "#ff7788" } },
  mana_crystal:       { shape: "crystal", colors: { col1: "#3355cc", col2: "#99ccff" } },
  // Effect potions
  haste_potion:       { shape: "potion",  colors: { col1: "#33bb55", col2: "#aaff99" } },
  shield_potion:      { shape: "potion",  colors: { col1: "#4477cc", col2: "#aaccff" } },
  might_potion:       { shape: "potion",  colors: { col1: "#cc4400", col2: "#ff9944" } },
  iron_skin_potion:   { shape: "potion",  colors: { col1: "#888888", col2: "#cccccc" } },
  regen_potion:       { shape: "potion",  colors: { col1: "#228833", col2: "#88ee88" } },
  power_potion:       { shape: "potion",  colors: { col1: "#993300", col2: "#ff8822" } },
  focus_potion:       { shape: "potion",  colors: { col1: "#6633cc", col2: "#bb88ff" } },
  cleanse_potion:     { shape: "potion",  colors: { col1: "#ffffff", col2: "#aaddff" } },
  // Elixirs (permanent boosts)
  vitality_elixir:    { shape: "crystal", colors: { col1: "#cc2244", col2: "#ffaacc" } },
  insight_elixir:     { shape: "crystal", colors: { col1: "#4433cc", col2: "#bbaaff" } },
  might_elixir:       { shape: "crystal", colors: { col1: "#aa3300", col2: "#ff8866" } },
  guard_elixir:       { shape: "crystal", colors: { col1: "#556677", col2: "#aabbcc" } },
  swift_elixir:       { shape: "crystal", colors: { col1: "#33aa66", col2: "#88ffcc" } },
  focus_elixir:       { shape: "crystal", colors: { col1: "#aa55ff", col2: "#ddbbff" } },
  // Bombs (tile-targeted)
  fire_bomb:          { shape: "crystal", colors: { col1: "#cc3300", col2: "#ffaa00" } },
  frost_bomb:         { shape: "crystal", colors: { col1: "#3399cc", col2: "#aaddff" } },
  shock_bomb:         { shape: "crystal", colors: { col1: "#ddcc00", col2: "#ffffaa" } },
  smoke_bomb:         { shape: "crystal", colors: { col1: "#555555", col2: "#999999" } },
  // Scrolls
  scroll_bolt:        { shape: "scroll",  colors: { col1: "#9999ff", col2: "#eeeeff" } },
  scroll_firebolt:    { shape: "scroll",  colors: { col1: "#ff6622", col2: "#ffcc88" } },
  scroll_frost_lance: { shape: "scroll",  colors: { col1: "#66ccff", col2: "#cceeff" } },
  scroll_shock_bolt:  { shape: "scroll",  colors: { col1: "#ffee44", col2: "#ffffcc" } },
  scroll_venom_dart:  { shape: "scroll",  colors: { col1: "#44bb44", col2: "#aaffaa" } },
  scroll_curse:       { shape: "scroll",  colors: { col1: "#8833aa", col2: "#cc88ff" } },
  scroll_mana_leech:  { shape: "scroll",  colors: { col1: "#3344bb", col2: "#aabbff" } },
  scroll_fireball:    { shape: "scroll",  colors: { col1: "#ff4400", col2: "#ffaa44" } },
  scroll_frost_nova:  { shape: "scroll",  colors: { col1: "#44aaee", col2: "#bbeeff" } },
  scroll_thunderclap: { shape: "scroll",  colors: { col1: "#ddbb00", col2: "#ffffaa" } },
  scroll_meteor:      { shape: "scroll",  colors: { col1: "#cc6600", col2: "#ffcc66" } },
  scroll_firewall:    { shape: "scroll",  colors: { col1: "#ff3300", col2: "#ff9966" } },
  scroll_poison_cloud: { shape: "scroll", colors: { col1: "#336622", col2: "#88ee77" } },
  scroll_bless:       { shape: "scroll",  colors: { col1: "#ffdd55", col2: "#ffffcc" } },
  scroll_might:       { shape: "scroll",  colors: { col1: "#bb4400", col2: "#ff8833" } },
  scroll_iron_skin:   { shape: "scroll",  colors: { col1: "#778899", col2: "#ccddee" } },
  scroll_mind_spark:  { shape: "scroll",  colors: { col1: "#cc88ff", col2: "#eeddff" } },
  scroll_focus:       { shape: "scroll",  colors: { col1: "#8855cc", col2: "#ccaaff" } },
  scroll_shield:      { shape: "scroll",  colors: { col1: "#5588cc", col2: "#aaccff" } },
  scroll_heal:        { shape: "scroll",  colors: { col1: "#44cc66", col2: "#aaff99" } },
  // Equipment — hats
  cloth_cap:      { shape: "hat",     colors: { col1: "#8a7a5c", col2: "#b8a884" } },
  wizard_hat:     { shape: "hat",     colors: { col1: "#3b2e66", col2: "#7a5fbf" } },
  // Robes
  leather_robe:   { shape: "robe",    colors: { col1: "#6b4a28", col2: "#8a7a5c" } },
  silk_robe:      { shape: "robe",    colors: { col1: "#4a2e6b", col2: "#b08fd9" } },
  // Staves
  wooden_staff:   { shape: "staff",   colors: { col1: "#8a6d3b", col2: "#ddb477" } },
  fire_staff:     { shape: "staff",   colors: { col1: "#ff4422", col2: "#ffcc66" } },
  // Daggers
  bone_dagger:    { shape: "dagger",  colors: { col1: "#e7dcc0", col2: "#8a7d5e" } },
  venom_dagger:   { shape: "dagger",  colors: { col1: "#2a6b3b", col2: "#a6ff7a" } },
  // Foci
  quartz_focus:   { shape: "focus",   colors: { col1: "#cceeff", col2: "#ffffff" } },
  runed_focus:    { shape: "focus",   colors: { col1: "#7744cc", col2: "#ffcc66" } },
});

// Fallback preset by shape/type — lets new items render with defaults before
// a bespoke preset exists.
export const FALLBACK_PRESETS: Record<ItemShape, ItemVisualPreset> = Object.freeze({
  potion:  { shape: "potion",  colors: { col1: "#666666", col2: "#aaaaaa" } },
  crystal: { shape: "crystal", colors: { col1: "#9999cc", col2: "#ddddff" } },
  scroll:  { shape: "scroll",  colors: { col1: "#ddbb88", col2: "#ffeecc" } },
  staff:   { shape: "staff",   colors: { col1: "#8a6d3b", col2: "#ddb477" } },
  robe:    { shape: "robe",    colors: { col1: "#555555", col2: "#888888" } },
  hat:     { shape: "hat",     colors: { col1: "#555555", col2: "#888888" } },
  dagger:  { shape: "dagger",  colors: { col1: "#cccccc", col2: "#888888" } },
  focus:   { shape: "focus",   colors: { col1: "#ccccff", col2: "#ffffff" } },
});
