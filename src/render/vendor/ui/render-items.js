// Item sprite draws — split out of render-entities.js for navigability.
// Each function is a pure canvas draw: (ctx, cx, cy, t, colors). Registration
// happens in render-entities.js (ITEM_RENDERERS dispatch map + drawItem
// fallbacks for scroll_/book_of_/_potion prefixes).

import { C, wire, lighten, darken } from "./render-context.js";

// ── Items ─────────────────────────────────────────────────

export function drawChest(ctx, cx, cy, t = 0, colors = { body: '#cc9933', bands: '#667788', lock: '#ffcc44' }) {
  const { body, bands, lock } = colors;
  wire(ctx, body);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 4); ctx.lineTo(cx + 10, cy - 4); ctx.lineTo(cx + 10, cy + 8); ctx.lineTo(cx - 10, cy + 8); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 4); ctx.bezierCurveTo(cx - 10, cy - 12, cx + 10, cy - 12, cx + 10, cy - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 4); ctx.stroke();
  wire(ctx, bands, 3);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx - 10, cy + 4); ctx.lineTo(cx + 10, cy + 4); ctx.stroke();
  wire(ctx, lock, 10); ctx.globalAlpha = Math.sin(t * 4) * 0.3 + 0.7;
  ctx.beginPath(); ctx.arc(cx, cy - 2, 2.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 0.5); ctx.lineTo(cx, cy + 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawSword(ctx, cx, cy, t = 0, colors = { blade: '#55bbff', guard: '#ffcc44', hilt: '#cc9933' }) {
  const { blade, guard, hilt } = colors;
  wire(ctx, blade);
  ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 3, cy - 16); ctx.lineTo(cx + 2, cy - 2); ctx.lineTo(cx, cy); ctx.lineTo(cx - 2, cy - 2); ctx.lineTo(cx - 3, cy - 16); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 2); ctx.stroke();
  wire(ctx, lighten(blade, 0.4), 12); const glow = Math.sin(t * 3) * 0.3 + 0.7; ctx.globalAlpha = glow;
  ctx.beginPath(); ctx.moveTo(cx, cy + 1); ctx.lineTo(cx + 2.5, cy + 3.5); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 2.5, cy + 3.5); ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = glow * 0.2; ctx.beginPath(); ctx.arc(cx, cy + 3.5, 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  wire(ctx, guard);
  ctx.beginPath(); ctx.moveTo(cx - 9, cy + 1); ctx.bezierCurveTo(cx - 9, cy - 2, cx - 4, cy - 1, cx, cy + 2); ctx.bezierCurveTo(cx + 4, cy - 1, cx + 9, cy - 2, cx + 9, cy + 1); ctx.stroke();
  wire(ctx, hilt);
  ctx.beginPath(); ctx.moveTo(cx - 1.5, cy + 6); ctx.lineTo(cx - 1.5, cy + 14); ctx.moveTo(cx + 1.5, cy + 6); ctx.lineTo(cx + 1.5, cy + 14); ctx.stroke();
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 2, cy + 7 + i * 3); ctx.lineTo(cx + 2, cy + 8 + i * 3); ctx.stroke(); }
  wire(ctx, lighten(hilt, 0.3)); ctx.beginPath(); ctx.arc(cx, cy + 16, 2.5, 0, Math.PI * 2); ctx.stroke();
}

export function drawManaCrystal(ctx, cx, cy, t = 0, col) {
  const color = col?.color ?? C.manaCrystal;
  wire(ctx, color, 10);
  const pulse = Math.sin(t * 2) * 0.15 + 1;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(6, -8); ctx.lineTo(6, 4); ctx.lineTo(0, 10); ctx.lineTo(-6, 4); ctx.lineTo(-6, -8); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 10); ctx.moveTo(-6, -8); ctx.lineTo(6, 4); ctx.moveTo(6, -8); ctx.lineTo(-6, 4); ctx.stroke();
  ctx.restore();
  wire(ctx, lighten(color, 0.3), 15); ctx.globalAlpha = 0.15 + Math.sin(t * 3) * 0.1;
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  wire(ctx, lighten(color, 0.3), 4);
  for (let i = 0; i < 3; i++) {
    const sa = t * 2 + i * 2.1, sr = 10 + Math.sin(sa * 1.5) * 4;
    ctx.globalAlpha = Math.max(0, Math.sin(sa)) * 0.6;
    ctx.beginPath(); ctx.arc(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr, 1, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawHealthPotion(ctx, cx, cy, t = 0, col) {
  const color = col?.color ?? C.healthPotion;
  wire(ctx, color, 8);
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - 8);
  ctx.lineTo(cx + 2, cy - 8);
  ctx.lineTo(cx + 2, cy - 5);
  ctx.lineTo(cx + 5, cy - 2);
  ctx.lineTo(cx + 5, cy + 6);
  ctx.lineTo(cx - 5, cy + 6);
  ctx.lineTo(cx - 5, cy - 2);
  ctx.lineTo(cx - 2, cy - 5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 1);
  ctx.lineTo(cx + 5, cy + 1);
  ctx.stroke();
}

export function drawScroll(ctx, cx, cy, t = 0, col) {
  const color = col?.color ?? C.spellScroll;
  wire(ctx, color, 8);
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 8);
  ctx.lineTo(cx + 4, cy - 8);
  ctx.lineTo(cx + 4, cy + 8);
  ctx.lineTo(cx - 4, cy + 8);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - 8, 6, 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 6, 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - 2);
  ctx.lineTo(cx + 2, cy + 2);
  ctx.moveTo(cx + 2, cy - 2);
  ctx.lineTo(cx - 2, cy + 2);
  ctx.stroke();
}

export function drawGenericItem(ctx, cx, cy) {
  wire(ctx, C.genericItem);
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Loot objects ───────────────────────────────────────────

export function drawBook(ctx, cx, cy, t = 0, col) {
  const leather = col?.col1 ?? '#664433', metal = col?.col2 ?? '#aa8833';
  const pages = lighten(leather, 0.3);
  wire(ctx, leather, 5);
  ctx.beginPath(); ctx.rect(cx - 7, cy - 6, 13, 12); ctx.stroke();
  wire(ctx, metal, 3);
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx - 4, cy - 6); ctx.moveTo(cx - 7, cy - 6); ctx.lineTo(cx - 7, cy - 3);
  ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 3, cy - 6); ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 6, cy - 3);
  ctx.moveTo(cx - 7, cy + 6); ctx.lineTo(cx - 4, cy + 6); ctx.moveTo(cx - 7, cy + 6); ctx.lineTo(cx - 7, cy + 3);
  ctx.moveTo(cx + 6, cy + 6); ctx.lineTo(cx + 3, cy + 6); ctx.moveTo(cx + 6, cy + 6); ctx.lineTo(cx + 6, cy + 3);
  ctx.stroke();
  wire(ctx, pages, 2);
  ctx.beginPath(); ctx.moveTo(cx + 6, cy - 5); ctx.lineTo(cx + 8, cy - 4); ctx.lineTo(cx + 8, cy + 5); ctx.lineTo(cx + 6, cy + 5); ctx.stroke();
  wire(ctx, metal, 3);
  ctx.beginPath(); ctx.arc(cx + 6, cy, 1.5, 0, Math.PI * 2); ctx.stroke();
}

export function drawKey(ctx, cx, cy, t = 0, col) {
  const metal = col?.col1 ?? '#8899aa', gem = col?.col2 ?? '#aa44ff';
  const pulse = Math.sin(t * 2.5) * 0.4 + 0.6;
  wire(ctx, metal, 4);
  ctx.beginPath(); ctx.arc(cx, cy - 5, 4, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, gem, 5 + pulse * 3); ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(cx, cy - 5, 2, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, metal, 3);
  ctx.beginPath(); ctx.moveTo(cx, cy - 1); ctx.lineTo(cx, cy + 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx + 3, cy + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx + 2, cy + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx + 4, cy + 9); ctx.stroke();
}

export function drawElixir(ctx, cx, cy, t = 0, col) {
  const glass = col?.col1 ?? '#99aacc', swirl = col?.col2 ?? '#aa44ff';
  const swirl2 = lighten(swirl, 0.35);
  const s = t * 1.5;
  wire(ctx, lighten(glass, 0.3), 2);
  ctx.beginPath(); ctx.rect(cx - 2, cy - 8, 4, 2); ctx.stroke();
  wire(ctx, glass, 2);
  ctx.beginPath();
  ctx.moveTo(cx - 1, cy - 6); ctx.lineTo(cx - 1, cy - 4); ctx.lineTo(cx - 4, cy - 2);
  ctx.lineTo(cx - 4, cy + 6); ctx.lineTo(cx + 4, cy + 6); ctx.lineTo(cx + 4, cy - 2);
  ctx.lineTo(cx + 1, cy - 4); ctx.lineTo(cx + 1, cy - 6);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 1, cy - 6); ctx.lineTo(cx + 1, cy - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, cy - 2); ctx.lineTo(cx + 4, cy - 2); ctx.stroke();
  wire(ctx, swirl, 2); ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = s + i * 0.52, r = 1.8 + Math.sin(i) * 0.7;
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r * 0.5)
            : ctx.lineTo(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r * 0.5);
  }
  ctx.stroke();
  wire(ctx, swirl2, 2); ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = s + Math.PI + i * 0.52, r = 1.8 + Math.sin(i) * 0.7;
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r * 0.5)
            : ctx.lineTo(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r * 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawPotion1(ctx, cx, cy, t = 0, col) {
  // Round-bodied vial with cork and rising bubbles
  const glass = col?.col1 ?? '#99ccbb', liquid = col?.col2 ?? '#33dd88';
  const bub = lighten(liquid, 0.4);
  const bt = t * 0.9;
  wire(ctx, glass, 2);
  ctx.beginPath(); ctx.arc(cx, cy + 3, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 1, cy - 2); ctx.lineTo(cx - 1, cy - 5); ctx.moveTo(cx + 1, cy - 2); ctx.lineTo(cx + 1, cy - 5); ctx.stroke();
  wire(ctx, darken(glass, 0.3), 2);
  ctx.beginPath(); ctx.rect(cx - 2, cy - 7, 4, 3); ctx.stroke();
  wire(ctx, liquid, 5); ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(cx, cy + 3, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, bub, 1.5);
  ctx.beginPath(); ctx.arc(cx - 1, cy + 4 + Math.sin(bt) * 0.6, 0.8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 2, cy + 2 + Math.sin(bt + 1.2) * 0.6, 0.6, 0, Math.PI * 2); ctx.stroke();
}

export function drawPotion2(ctx, cx, cy, t = 0, col) {
  // Squat wide flask with glowing liquid
  const glass = col?.col1 ?? '#aabbaa', liquid = col?.col2 ?? '#ffaa00';
  const glow = lighten(liquid, 0.3);
  const pulse = Math.sin(t * 2) * 0.4 + 0.6;
  wire(ctx, glass, 2);
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx - 5, cy); ctx.lineTo(cx - 2, cy - 3);
  ctx.lineTo(cx + 2, cy - 3); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx + 5, cy + 5);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 2, cy - 3); ctx.lineTo(cx - 2, cy - 6); ctx.moveTo(cx + 2, cy - 3); ctx.lineTo(cx + 2, cy - 6); ctx.stroke();
  wire(ctx, darken(glass, 0.3), 2);
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - 6); ctx.lineTo(cx + 3, cy - 6); ctx.stroke();
  wire(ctx, liquid, 3 + pulse); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - 4, cy + 1); ctx.lineTo(cx + 4, cy + 1); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, glow, 5 + pulse * 2); ctx.globalAlpha = 0.2 + pulse * 0.12;
  ctx.beginPath(); ctx.arc(cx, cy + 2, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Equipment — Hats ───────────────────────────────────────

export function drawHat1(ctx, cx, cy, t = 0, col) {
  // Pointed wizard hat — symmetric cone, wide brim, twinkling tip
  const crown = col?.col1 ?? '#4422aa', trim = col?.col2 ?? '#aa88ff';
  const shine = lighten(trim, 0.3);
  wire(ctx, crown, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 6, cy + 3); ctx.lineTo(cx + 6, cy + 3); ctx.closePath(); ctx.stroke();
  wire(ctx, darken(crown, 0.2), 4);
  ctx.beginPath(); ctx.ellipse(cx, cy + 3, 8, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, trim, 2);
  ctx.beginPath(); ctx.moveTo(cx - 5, cy + 1); ctx.lineTo(cx + 5, cy + 1); ctx.stroke();
  wire(ctx, shine, 3); ctx.globalAlpha = 0.7 + Math.sin(t * 3) * 0.25;
  ctx.beginPath(); ctx.arc(cx, cy - 6, 1, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawHat2(ctx, cx, cy, t = 0, col) {
  // Dark obelisk — narrow spike, minimal brim, pulsing rune
  const crown = col?.col1 ?? '#110022', rune = col?.col2 ?? '#6633aa';
  const pulse = Math.sin(t * 2.5) * 0.4 + 0.6;
  wire(ctx, crown, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx + 3, cy + 3); ctx.closePath(); ctx.stroke();
  wire(ctx, darken(crown, 0.1), 4);
  ctx.beginPath(); ctx.ellipse(cx, cy + 3, 7, 2, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, rune, 2 + pulse * 2); ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - 1, cy - 2); ctx.lineTo(cx + 1, cy - 5);
  ctx.moveTo(cx - 1, cy - 3.5); ctx.lineTo(cx + 1, cy - 3.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Equipment — Staves ─────────────────────────────────────

export function drawWoodenStaff(ctx, cx, cy, t = 0, col) {
  const shaft = col?.col1 ?? '#8B5E3C', knob = col?.col2 ?? '#a06030';
  const grain = darken(shaft, 0.3);
  const sway = Math.sin(t * 1.2) * 1;
  wire(ctx, shaft, 5);
  ctx.beginPath(); ctx.moveTo(cx - 1 + sway * 0.3, cy + 22); ctx.bezierCurveTo(cx - 2, cy + 8, cx + 2, cy - 6, cx + sway, cy - 12); ctx.stroke();
  wire(ctx, knob, 6);
  ctx.beginPath(); ctx.arc(cx + sway, cy - 15, 5, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, grain, 2); ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(cx - 3, cy + 14); ctx.lineTo(cx - 1, cy + 10); ctx.moveTo(cx - 3, cy + 4); ctx.lineTo(cx - 1, cy); ctx.moveTo(cx + 2, cy - 4); ctx.lineTo(cx + 1, cy - 8); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawFireStaff(ctx, cx, cy, t = 0, col) {
  const shaft = col?.col1 ?? '#332211', orb = col?.col2 ?? '#ff6600';
  const flame = lighten(orb, 0.35);
  const flick = Math.sin(t * 5) * 1.5;
  wire(ctx, shaft, 5);
  ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy - 10); ctx.stroke();
  wire(ctx, lighten(shaft, 0.2), 3);
  ctx.beginPath(); ctx.moveTo(cx - 4, cy + 14); ctx.lineTo(cx + 4, cy + 14); ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx + 4, cy + 2); ctx.stroke();
  wire(ctx, orb, 10 + flick);
  ctx.beginPath(); ctx.arc(cx, cy - 14, 6, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, flame, 7); ctx.globalAlpha = 0.7 + Math.sin(t * 4) * 0.25;
  ctx.beginPath(); ctx.moveTo(cx - 4, cy - 18); ctx.lineTo(cx, cy - 24); ctx.lineTo(cx + 4, cy - 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 2, cy - 20); ctx.lineTo(cx, cy - 22); ctx.lineTo(cx + 2, cy - 20); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawIronStaff(ctx, cx, cy, t = 0, col) {
  const shaft = col?.col1 ?? '#778899', crystal = col?.col2 ?? '#66aaff';
  const band = lighten(shaft, 0.25);
  const pulse = Math.sin(t * 2) * 0.5 + 0.5;
  wire(ctx, shaft, 5);
  ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx, cy - 6); ctx.stroke();
  wire(ctx, band, 4);
  ctx.beginPath(); ctx.moveTo(cx - 5, cy + 10); ctx.lineTo(cx + 5, cy + 10); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.stroke();
  wire(ctx, crystal, 9 + pulse * 5);
  ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 6, cy - 12); ctx.lineTo(cx, cy - 6); ctx.lineTo(cx - 6, cy - 12); ctx.closePath(); ctx.stroke();
  wire(ctx, lighten(crystal, 0.3), 2); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx - 6, cy - 12); ctx.lineTo(cx + 6, cy - 12); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Equipment — Robes ──────────────────────────────────────

export function drawRobeFolded(ctx, cx, cy, t = 0, col) {
  const body = col?.col1 ?? '#334488', trim = col?.col2 ?? '#6677aa';
  const fold = darken(body, 0.35);
  wire(ctx, body, 5);
  ctx.beginPath(); ctx.moveTo(cx - 12, cy + 6); ctx.lineTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy - 8); ctx.lineTo(cx + 12, cy + 6); ctx.closePath(); ctx.stroke();
  wire(ctx, fold, 4);
  ctx.beginPath(); ctx.ellipse(cx, cy - 7, 6, 3, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, fold, 2); ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 11, cy + 3); ctx.lineTo(cx + 11, cy + 3); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, trim, 3);
  ctx.beginPath(); ctx.moveTo(cx - 12, cy + 6); ctx.lineTo(cx + 12, cy + 6); ctx.stroke();
}

export function drawRobeFoldedEmber(ctx, cx, cy, t = 0, col) {
  const body = col?.col1 ?? '#1a1a2a', ember = col?.col2 ?? '#ff6633';
  const glow = lighten(ember, 0.3);
  const pulse = Math.sin(t * 3) * 0.5 + 0.5;
  wire(ctx, body, 5);
  ctx.beginPath(); ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx - 7, cy - 9); ctx.lineTo(cx + 7, cy - 9); ctx.lineTo(cx + 11, cy + 6); ctx.closePath(); ctx.stroke();
  wire(ctx, darken(body, 0.15), 4);
  ctx.beginPath(); ctx.ellipse(cx, cy - 8, 5, 2.5, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, ember, 3 + pulse); ctx.globalAlpha = 0.7 + pulse * 0.25;
  ctx.beginPath(); ctx.moveTo(cx - 11, cy + 6); ctx.lineTo(cx + 11, cy + 6); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, glow, 4 + pulse * 2); ctx.globalAlpha = 0.5 + pulse * 0.25;
  ctx.beginPath(); ctx.arc(cx, cy - 1, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Equipment — Daggers ────────────────────────────────────

export function drawDaggerA(ctx, cx, cy, t = 0, col) {
  // Triangle blade
  const blade = col?.col1 ?? '#aaccee', handle = col?.col2 ?? '#885533';
  const guard = darken(blade, 0.25);
  wire(ctx, blade, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx - 2, cy + 1); ctx.lineTo(cx + 2, cy + 1); ctx.closePath(); ctx.stroke();
  wire(ctx, guard, 4);
  ctx.beginPath(); ctx.moveTo(cx - 4, cy + 1); ctx.lineTo(cx + 4, cy + 1); ctx.stroke();
  wire(ctx, handle, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy + 6); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + 7, 1.5, 0, Math.PI * 2); ctx.stroke();
}

export function drawDaggerB(ctx, cx, cy, t = 0, col) {
  // Leaf blade
  const blade = col?.col1 ?? '#aaccee', handle = col?.col2 ?? '#885533';
  const guard = darken(blade, 0.25);
  wire(ctx, blade, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 3, cy - 1); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx - 3, cy - 1); ctx.closePath(); ctx.stroke();
  wire(ctx, guard, 4);
  ctx.beginPath(); ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx + 4, cy + 2); ctx.stroke();
  wire(ctx, handle, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 7); ctx.stroke();
}

// ── Equipment — Foci ───────────────────────────────────────

export function drawFocusA(ctx, cx, cy, t = 0, col) {
  // Glowing orb
  const orb = col?.col1 ?? '#334455', glow = col?.col2 ?? '#66aaff';
  const inner = lighten(glow, 0.4);
  const pulse = Math.sin(t * 2) * 0.4 + 0.6;
  wire(ctx, orb, 4);
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, glow, 7 + pulse * 3); ctx.globalAlpha = 0.5 + pulse * 0.25;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, inner, 3);
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.stroke();
}

export function drawFocusB(ctx, cx, cy, t = 0, col) {
  // Crystal diamond
  const crystal = col?.col1 ?? '#ccddee', glow = col?.col2 ?? '#aaddff';
  const facet = darken(crystal, 0.25);
  const pulse = Math.sin(t * 2) * 0.3 + 0.7;
  wire(ctx, crystal, 4);
  ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.stroke();
  wire(ctx, facet, 2); ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, glow, 5 + pulse * 3); ctx.globalAlpha = 0.3 + pulse * 0.15;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Floor traps ───────────────────────────────────────────

export function drawTrap1(ctx, cx, cy, t = 0, col) {
  // Spike trap — pressure plate with 3×2 spike tips
  const plate = col?.col1 ?? '#554433', spike = col?.col2 ?? '#aaaaaa';
  wire(ctx, plate, 2);
  ctx.beginPath(); ctx.rect(cx - 14, cy - 12, 28, 24); ctx.stroke();
  wire(ctx, darken(plate, 0.15), 1.5);
  ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
  wire(ctx, spike, 3);
  for (const [dx, dy] of [[-7, -5], [0, -5], [7, -5], [-7, 5], [0, 5], [7, 5]]) {
    ctx.beginPath(); ctx.moveTo(cx + dx - 2, cy + dy + 3); ctx.lineTo(cx + dx, cy + dy - 4); ctx.lineTo(cx + dx + 2, cy + dy + 3); ctx.stroke();
  }
}

export function drawTrap2(ctx, cx, cy, t = 0, col) {
  // Fire trap — metal grate with pulsing fire-glow from below
  const grate = col?.col1 ?? '#443322', flame = col?.col2 ?? '#ff6600';
  const pulse = Math.sin(t * 3) * 0.3 + 0.7;
  wire(ctx, grate, 2);
  for (const dy of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx - 12, cy + dy); ctx.lineTo(cx + 12, cy + dy); ctx.stroke(); }
  for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx + dx, cy - 12); ctx.lineTo(cx + dx, cy + 12); ctx.stroke(); }
  wire(ctx, flame, 10 * pulse); ctx.globalAlpha = 0.35 * pulse;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, lighten(flame, 0.4), 5); ctx.globalAlpha = 0.65 * pulse;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawTrap3(ctx, cx, cy, t = 0, col) {
  // Rune trap — inscribed magic circle, two overlapping triangles, pulsing core
  const ring = col?.col1 ?? '#331166', glow = col?.col2 ?? '#9944ff';
  const pulse = Math.sin(t * 2.2) * 0.35 + 0.65;
  wire(ctx, ring, 2);
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, ring, 1.5);
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, glow, 1.5); ctx.globalAlpha = 0.6 + pulse * 0.3;
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7, cy + 4); ctx.lineTo(cx - 7, cy + 4); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx + 7, cy - 4); ctx.lineTo(cx - 7, cy - 4); ctx.closePath(); ctx.stroke();
  wire(ctx, lighten(glow, 0.4), 3 + pulse * 3); ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}
