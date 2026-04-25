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
  // ── Consumables ──────────────────────────────────────────────────────────
  health_potion:      { shape: "potion",  colors: { col1: "#cc1133", col2: "#ff7788" } },
  mana_crystal:       { shape: "crystal", colors: { col1: "#3355cc", col2: "#99ccff" } },
  haste_potion:       { shape: "potion",  colors: { col1: "#33bb55", col2: "#aaff99" } },
  cleanse_potion:     { shape: "potion",  colors: { col1: "#ffffff", col2: "#aaddff" } },

  // ── Hats ─────────────────────────────────────────────────────────────────
  cloth_cap:          { shape: "hat",     colors: { col1: "#8a7a5c", col2: "#b8a884" } },
  wizard_hat:         { shape: "hat",     colors: { col1: "#3b2e66", col2: "#7a5fbf" } },
  iron_helm:          { shape: "hat",     colors: { col1: "#5a6a7a", col2: "#a0b0c0" } },
  stoic_helm:         { shape: "hat",     colors: { col1: "#4a4a55", col2: "#888899" } },
  crown_of_ages:      { shape: "hat",     colors: { col1: "#b8860b", col2: "#ffd700" } },
  lucky_crown:        { shape: "hat",     colors: { col1: "#22aa66", col2: "#88ffcc" } },
  arcane_diadem:      { shape: "hat",     colors: { col1: "#6622cc", col2: "#cc88ff" } },

  // ── Robes ─────────────────────────────────────────────────────────────────
  leather_robe:       { shape: "robe",    colors: { col1: "#6b4a28", col2: "#8a7a5c" } },
  silk_robe:          { shape: "robe",    colors: { col1: "#4a2e6b", col2: "#b08fd9" } },
  chain_vestment:     { shape: "robe",    colors: { col1: "#6a7a8a", col2: "#b0bec5" } },
  thorned_robe:       { shape: "robe",    colors: { col1: "#2a5522", col2: "#66aa44" } },
  shadow_cloak:       { shape: "robe",    colors: { col1: "#1a1a2e", col2: "#4a3a6e" } },
  spellweaver_robe:   { shape: "robe",    colors: { col1: "#2244aa", col2: "#88aaff" } },

  // ── Staves ────────────────────────────────────────────────────────────────
  wooden_staff:       { shape: "staff",   colors: { col1: "#8a6d3b", col2: "#ddb477" } },
  fire_staff:         { shape: "staff",   colors: { col1: "#ff4422", col2: "#ffcc66" } },
  shock_staff:        { shape: "staff",   colors: { col1: "#eecc00", col2: "#ffffff" } },
  draining_staff:     { shape: "staff",   colors: { col1: "#442266", col2: "#9944cc" } },
  crystal_staff:      { shape: "staff",   colors: { col1: "#aaeeff", col2: "#ffffff" } },

  // ── Daggers ───────────────────────────────────────────────────────────────
  bone_dagger:        { shape: "dagger",  colors: { col1: "#e7dcc0", col2: "#8a7d5e" } },
  steel_dagger:       { shape: "dagger",  colors: { col1: "#c0c8d0", col2: "#e8edf2" } },
  venom_dagger:       { shape: "dagger",  colors: { col1: "#2a6b3b", col2: "#a6ff7a" } },
  shadow_blade:       { shape: "dagger",  colors: { col1: "#1e1e2e", col2: "#6655aa" } },
  frost_shard:        { shape: "dagger",  colors: { col1: "#88ccee", col2: "#ddeeff" } },
  wild_dagger:        { shape: "dagger",  colors: { col1: "#cc6600", col2: "#ffaa33" } },
  vampiric_blade:     { shape: "dagger",  colors: { col1: "#880022", col2: "#ff3366" } },

  // ── Foci ──────────────────────────────────────────────────────────────────
  quartz_focus:       { shape: "focus",   colors: { col1: "#cceeff", col2: "#ffffff" } },
  runed_focus:        { shape: "focus",   colors: { col1: "#7744cc", col2: "#ffcc66" } },
  void_focus:         { shape: "focus",   colors: { col1: "#110022", col2: "#5500aa" } },
  bloodstone:         { shape: "focus",   colors: { col1: "#880022", col2: "#cc4444" } },
  star_fragment:      { shape: "focus",   colors: { col1: "#ffeebb", col2: "#ffffee" } },
  necromancer_focus:  { shape: "focus",   colors: { col1: "#334422", col2: "#88bb55" } },
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
