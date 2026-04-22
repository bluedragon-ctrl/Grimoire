// Dungeon object sprite dispatch — type → draw function.
// Each draw function is (ctx, cx, cy, t, colors).

import { wire, lighten } from './render-context.js';
import { drawChest, drawTrap1, drawTrap2, drawTrap3 } from './render-items.js';
import { drawStairs, drawDoorBody, drawDoorOpenBody } from './render-tiles.js';

// ── Shrine ───────────────────────────────────────────────

function drawShrine(ctx, cx, cy, t, colors = {}) {
  const stone = colors.stone ?? '#887766';
  const glow  = colors.glow  ?? '#ffcc44';
  const pulse = Math.sin(t * 2) * 0.4 + 0.6;
  wire(ctx, stone, 3);
  ctx.beginPath(); ctx.rect(cx - 10, cy + 12, 20, 4); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx - 7, cy + 8, 14, 4); ctx.stroke();
  wire(ctx, stone, 4);
  ctx.beginPath(); ctx.rect(cx - 6, cy - 8, 12, 17); ctx.stroke();
  wire(ctx, lighten(stone, 0.2), 3);
  ctx.beginPath(); ctx.rect(cx - 8, cy - 11, 16, 4); ctx.stroke();
  wire(ctx, glow, 3 + pulse * 2); ctx.globalAlpha = 0.65 + pulse * 0.25;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
  ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3);
  ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3);
  ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, glow, 8 + pulse * 4); ctx.globalAlpha = 0.12 + pulse * 0.08;
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Fountain ─────────────────────────────────────────────

function drawFountain(ctx, cx, cy, t, colors = {}) {
  const stone = colors.stone ?? '#778899';
  const water = colors.water ?? '#44aadd';
  const foam  = lighten(water, 0.4);
  const s = t * 1.8;
  wire(ctx, stone, 4);
  ctx.beginPath(); ctx.ellipse(cx, cy + 8, 13, 5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 13, cy + 8); ctx.lineTo(cx - 10, cy + 1); ctx.moveTo(cx + 13, cy + 8); ctx.lineTo(cx + 10, cy + 1); ctx.stroke();
  wire(ctx, water, 3); ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.ellipse(cx, cy + 6, 8, 3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, stone, 3);
  ctx.beginPath(); ctx.moveTo(cx - 2, cy + 1); ctx.lineTo(cx - 2, cy - 6); ctx.moveTo(cx + 2, cy + 1); ctx.lineTo(cx + 2, cy - 6); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy - 6, 5, 2, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, water, 2); ctx.globalAlpha = 0.75;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + s * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.quadraticCurveTo(cx + Math.cos(a) * 5, cy - 14 + Math.sin(s + i) * 1.5, cx + Math.cos(a) * 7, cy + 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const [dx, dy, ph] of [[-7, 2, 0], [7, 0, 1.2], [-5, 5, 2.4], [6, 4, 0.8]]) {
    const a = Math.sin(s + ph);
    wire(ctx, foam, 2); ctx.globalAlpha = 0.4 + a * 0.35;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 1, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Throne ───────────────────────────────────────────────

function drawThrone(ctx, cx, cy, t, colors = {}) {
  const wood   = colors.wood   ?? '#6b3a1f';
  const accent = colors.accent ?? '#cc9922';
  const shine  = lighten(accent, 0.3);
  wire(ctx, wood, 5);
  ctx.beginPath(); ctx.rect(cx - 10, cy - 18, 20, 16); ctx.stroke();
  wire(ctx, accent, 4);
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 18); ctx.lineTo(cx - 10, cy - 22);
  ctx.lineTo(cx - 6,  cy - 20); ctx.lineTo(cx - 3,  cy - 25);
  ctx.lineTo(cx,      cy - 21); ctx.lineTo(cx + 3,  cy - 25);
  ctx.lineTo(cx + 6,  cy - 20); ctx.lineTo(cx + 10, cy - 22);
  ctx.lineTo(cx + 10, cy - 18);
  ctx.stroke();
  wire(ctx, wood, 4);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 2); ctx.lineTo(cx - 15, cy - 2); ctx.lineTo(cx - 15, cy + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 10, cy - 2); ctx.lineTo(cx + 15, cy - 2); ctx.lineTo(cx + 15, cy + 6); ctx.stroke();
  wire(ctx, lighten(wood, 0.15), 4);
  ctx.beginPath(); ctx.rect(cx - 10, cy - 2, 20, 8); ctx.stroke();
  wire(ctx, wood, 3);
  ctx.beginPath(); ctx.moveTo(cx - 9, cy + 6); ctx.lineTo(cx - 9, cy + 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 9, cy + 6); ctx.lineTo(cx + 9, cy + 16); ctx.stroke();
  wire(ctx, accent, 2); ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.rect(cx - 7, cy - 16, 14, 12); ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, accent, 5); ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(cx, cy - 11, 3, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, shine, 3);
  ctx.beginPath(); ctx.arc(cx, cy - 11, 1.5, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Dispatch ─────────────────────────────────────────────

const OBJECT_RENDERERS = {
  chest:           drawChest,
  shrine:          drawShrine,
  fountain:        drawFountain,
  fountain_health: (ctx, cx, cy, t, col) => drawFountain(ctx, cx, cy, t, { ...col, water: '#dd4444', stone: col?.stone ?? '#887766' }),
  fountain_mana:   (ctx, cx, cy, t, col) => drawFountain(ctx, cx, cy, t, { ...col, water: '#44aadd' }),
  throne:          drawThrone,
  door_closed:     (ctx, cx, cy, t, col) => drawDoorBody(ctx, cx, cy, col),
  door_open:       (ctx, cx, cy, t, col) => drawDoorOpenBody(ctx, cx, cy, col),
  stairs_down: (ctx, cx, cy, t, col) => drawStairs(ctx, cx, cy, 'down', col),
  stairs_up:   (ctx, cx, cy, t, col) => drawStairs(ctx, cx, cy, 'up',   col),

  // Spike family
  trap_spike:        (ctx, cx, cy, t, col) => drawTrap1(ctx, cx, cy, t, col ?? { col1: '#554433', col2: '#aaaaaa' }),
  trap_poison_spike: (ctx, cx, cy, t, col) => drawTrap1(ctx, cx, cy, t, col ?? { col1: '#334422', col2: '#55aa22' }),
  trap_bear_trap:    (ctx, cx, cy, t, col) => drawTrap1(ctx, cx, cy, t, col ?? { col1: '#553322', col2: '#776655' }),

  // Fire-grate family
  trap_fire:  (ctx, cx, cy, t, col) => drawTrap2(ctx, cx, cy, t, col ?? { col1: '#443322', col2: '#ff6600' }),
  trap_cold:  (ctx, cx, cy, t, col) => drawTrap2(ctx, cx, cy, t, col ?? { col1: '#334455', col2: '#88ccff' }),
  trap_steam: (ctx, cx, cy, t, col) => drawTrap2(ctx, cx, cy, t, col ?? { col1: '#556655', col2: '#cccccc' }),

  // Rune family
  trap_lightning: (ctx, cx, cy, t, col) => drawTrap3(ctx, cx, cy, t, col ?? { col1: '#221144', col2: '#ffff44' }),
  trap_teleport:  (ctx, cx, cy, t, col) => drawTrap3(ctx, cx, cy, t, col ?? { col1: '#332244', col2: '#cc44ff' }),
  trap_mana_burn: (ctx, cx, cy, t, col) => drawTrap3(ctx, cx, cy, t, col ?? { col1: '#223344', col2: '#44aaff' }),
  trap_weaken:    (ctx, cx, cy, t, col) => drawTrap3(ctx, cx, cy, t, col ?? { col1: '#334433', col2: '#aa4422' }),
};

export function drawObject(ctx, cx, cy, type, t = 0, colors) {
  const renderer = OBJECT_RENDERERS[type];
  if (renderer) renderer(ctx, cx, cy, t, colors);
}
