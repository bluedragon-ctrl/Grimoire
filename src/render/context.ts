// Shared renderer state and utilities.
// Tile size, color palette, `wire()` helper, and hex-color utilities.

export const TILE = 48;

export const C = {
  // Entities (base colors — highlights derived via lighten())
  mage:      "#aa66ff",
  skeleton:  "#ccbb99",
  torch:     "#ff8833",

  // Amber monochrome
  wall:      "#ff8800",
  wallHi:    "#ffaa33",
  floor:     "#0d0700",
  floorLine: "#804400",
  stairsDown:"#cc6d00",
  stairsUp:  "#ff8800",
  bg:        "#0a0600",

  // Items
  manaCrystal:  "#66aaff",
  healthPotion: "#ff4444",
  spellScroll:  "#88ddff",
  genericItem:  "#c8a96e",
} as const;

// ── Color Utilities ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

/** Lighten a hex color by mixing toward white. factor 0–1. */
export function lighten(hex: string, factor = 0.3): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  );
}

/** Darken a hex color by mixing toward black. factor 0–1. */
export function darken(hex: string, factor = 0.3): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * (1 - factor)),
    Math.round(g * (1 - factor)),
    Math.round(b * (1 - factor)),
  );
}

// ── Drawing Utility ────────────────────────────────────────

const DEFAULT_GLOW = 6;

/** Set stroke style + glow for wire-frame drawing. One call per "pen" change. */
export function wire(ctx: CanvasRenderingContext2D, color: string, glowAmount = DEFAULT_GLOW): void {
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowAmount;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}
