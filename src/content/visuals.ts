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
}

export interface CloudPreset {
  colors: { color: string; color2: string };
}

export interface EffectOverlayPreset {
  name: string;
  colors: { color: string; color2: string };
}

export const PROJECTILE_PRESETS: Record<string, ProjectilePreset> = Object.freeze({
  bolt_orange: { projectile: "bolt",   colors: { color: "#ff6622", color2: "#ffdd66" } },
  bolt_red:    { projectile: "bolt",   colors: { color: "#ff3322", color2: "#ffaa33" } },
  bolt_blue:   { projectile: "bolt",   colors: { color: "#3366ff", color2: "#99ccff" } },
  bolt_green:  { projectile: "bolt",   colors: { color: "#44cc66", color2: "#aaffcc" } },
  bolt_gold:   { projectile: "bolt",   colors: { color: "#ffcc00", color2: "#ffffff" } },
  beam_frost:  { projectile: "beam",   colors: { color: "#66ccff", color2: "#ffffff" } },
  beam_arcane: { projectile: "beam",   colors: { color: "#bb66ff", color2: "#ffffff" } },
  thrown_smoke:{ projectile: "thrown", colors: { color: "#666666", color2: "#aaaaaa" } },
});

export const BURST_PRESETS: Record<string, BurstPreset> = Object.freeze({
  burst_ember:  { burst: "ember",  colors: { color: "#ff6622", color2: "#ffcc33" } },
  burst_frost:  { burst: "frost",  colors: { color: "#66ccff", color2: "#ffffff" } },
  burst_arcane: { burst: "arcane", colors: { color: "#bb66ff", color2: "#ffddff" } },
});

export const CLOUD_PRESETS: Record<string, CloudPreset> = Object.freeze({
  cloud_fire:  { colors: { color: "#ff6622", color2: "#ffaa33" } },
  cloud_frost: { colors: { color: "#66ccff", color2: "#ccffff" } },
  cloud_smoke: { colors: { color: "#555555", color2: "#999999" } },
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
  burning: { name: "burning",   colors: { color: "#ff6622", color2: "#ffcc33" } },
  poison:  { name: "dripping",  colors: { color: "#33aa55", color2: "#aaff88" } },
  regen:   { name: "healing",   colors: { color: "#66ff99", color2: "#ccffcc" } },
  haste:   { name: "sparkling", colors: { color: "#ffff99", color2: "#ffffff" } },
  slow:    { name: "cloudWavy", colors: { color: "#6688aa", color2: "#aaccee" } },
});
