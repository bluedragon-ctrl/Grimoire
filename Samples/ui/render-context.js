// Shared renderer state and utilities.
// Canvas context, tile size, color palette, and the wire() helper.

export const TILE = 48;

export const C = {
  // Entities (base colors — highlights derived via lighten())
  mage:      '#aa66ff',
  skeleton:  '#ccbb99',
  torch:     '#ff8833',

  // Amber monochrome
  wall:      '#ff8800',
  wallHi:    '#ffaa33',
  floor:     '#0d0700',
  floorLine: '#804400',
  stairsDown:'#cc6d00',
  stairsUp:  '#ff8800',
  bg:        '#0a0600',

  // Items
  manaCrystal: '#66aaff',
  healthPotion: '#ff4444',
  spellScroll: '#88ddff',
  genericItem: '#c8a96e',
};

// ── Color Utilities ────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color by mixing toward white. factor 0–1. */
export function lighten(hex, factor = 0.3) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  );
}

/** Darken a hex color by mixing toward black. factor 0–1. */
export function darken(hex, factor = 0.3) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * (1 - factor)),
    Math.round(g * (1 - factor)),
    Math.round(b * (1 - factor)),
  );
}

// ── Canvas state (set by initRenderer) ─────────────────────

let canvas = null;
let ctx = null;

export function setCanvas(canvasElement) {
  canvas = canvasElement;
  ctx = canvas.getContext('2d');
}

export function getCanvas() { return canvas; }
export function getCtx() { return ctx; }

// ── Drawing Utility ────────────────────────────────────────

const DEFAULT_GLOW = 6;

export function wire(ctx, color, glowAmount = DEFAULT_GLOW) {
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowAmount;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
