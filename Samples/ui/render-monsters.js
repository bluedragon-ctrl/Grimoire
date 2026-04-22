// Monster sprite draws — split out of render-entities.js for navigability.
// Each function is a pure canvas draw: (ctx, cx, cy, t, colors). Registration
// happens in render-entities.js (MONSTER_RENDERERS dispatch map).

import { C, wire, lighten, darken } from "./render-context.js";
import { dots, eyePair, lines, zigzag, orbit } from "./render-prims.js";

// ── Player ────────────────────────────────────────────────


export function drawMage(ctx, cx, cy, t = 0, colors = {}) {
  const body      = colors.body   ?? C.mage;
  const staffCol  = colors.staff  ?? C.mage;
  const magic     = colors.magic  ?? C.mage;
  const hatCol    = colors.hat    ?? body;
  const faceCol   = colors.face   ?? body;
  const daggerCol = colors.dagger ?? body;
  const focusCol  = colors.focus  ?? magic;

  // Pointed hat
  wire(ctx, hatCol);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx - 8, cy - 10);
  ctx.lineTo(cx + 8, cy - 10);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy - 10);
  ctx.lineTo(cx + 11, cy - 10);
  ctx.stroke();

  // Face (separate color slot)
  wire(ctx, faceCol);
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 4, 0, Math.PI * 2);
  ctx.stroke();

  // Robe body + arms
  wire(ctx, body);
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 2);
  ctx.lineTo(cx - 12, cy + 18);
  ctx.lineTo(cx + 12, cy + 18);
  ctx.lineTo(cx + 5, cy - 2);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy);
  ctx.lineTo(cx - 6, cy + 18);
  ctx.moveTo(cx + 2, cy);
  ctx.lineTo(cx + 6, cy + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 4);
  ctx.lineTo(cx + 7, cy + 4);
  ctx.stroke();
  // Left arm
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx - 14, cy + 4);
  ctx.stroke();
  // Right arm (to staff)
  ctx.beginPath();
  ctx.moveTo(cx + 5, cy);
  ctx.lineTo(cx + 16, cy + 2);
  ctx.stroke();

  // Staff pole + orb
  wire(ctx, staffCol);
  ctx.beginPath();
  ctx.moveTo(cx + 16, cy - 16);
  ctx.lineTo(cx + 16, cy + 18);
  ctx.stroke();
  wire(ctx, lighten(staffCol, 0.35), 10);
  const glow = 3 + Math.sin(t * 3) * 1.5;
  ctx.beginPath();
  ctx.arc(cx + 16, cy - 18, glow, 0, Math.PI * 2);
  ctx.stroke();

  // Dagger in left hand — angled blade pointing upper-left
  wire(ctx, daggerCol, 4);
  ctx.beginPath();
  ctx.moveTo(cx - 19, cy - 1);   // blade tip
  ctx.lineTo(cx - 13, cy + 5);   // blade base at hand
  ctx.stroke();
  wire(ctx, darken(daggerCol, 0.25), 3);
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy + 3);   // guard (perpendicular to blade)
  ctx.lineTo(cx - 15, cy + 7);
  ctx.stroke();

  // Focus gem orbiting body (elliptical, mid-body center)
  const fa  = t * 1.0;
  const fgx = cx + Math.cos(fa) * 15;
  const fgy = (cy + 6) + Math.sin(fa) * 8;
  const fgs = 3;
  wire(ctx, lighten(focusCol, 0.3), 8 + Math.sin(t * 2.5) * 3);
  ctx.globalAlpha = 0.35 + Math.sin(t * 2.5) * 0.12;
  ctx.beginPath();
  ctx.arc(fgx, fgy, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  wire(ctx, focusCol, 3);
  ctx.beginPath();
  ctx.moveTo(fgx, fgy - fgs);
  ctx.lineTo(fgx + fgs, fgy);
  ctx.lineTo(fgx, fgy + fgs);
  ctx.lineTo(fgx - fgs, fgy);
  ctx.closePath();
  ctx.stroke();
}

// ── Monsters ──────────────────────────────────────────────

export function drawSkeleton(ctx, cx, cy, t = 0, colors = { skull: C.skeleton, torso: C.skeleton, limbs: C.skeleton }) {
  const { skull: head, torso: body, limbs: legs } = colors;

  // Skull
  wire(ctx, head);
  ctx.beginPath();
  ctx.arc(cx, cy - 12, 7, 0, Math.PI * 2);
  ctx.stroke();

  // Eye sockets
  wire(ctx, lighten(head, 0.35), 4);
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 13, 2, 0, Math.PI * 2);
  ctx.arc(cx + 3, cy - 13, 2, 0, Math.PI * 2);
  ctx.stroke();

  // Jaw
  wire(ctx, head);
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 8);
  ctx.lineTo(cx - 3, cy - 5);
  ctx.lineTo(cx + 3, cy - 5);
  ctx.lineTo(cx + 4, cy - 8);
  ctx.stroke();

  // Teeth
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(cx + i * 1.5, cy - 7);
    ctx.lineTo(cx + i * 1.5, cy - 5.5);
  }
  ctx.stroke();

  // Spine
  wire(ctx, body);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  // Ribs
  for (let i = 1; i < 3; i++) {
    const ry = cy - 2 + i * 4;
    ctx.beginPath();
    ctx.moveTo(cx, ry);
    ctx.quadraticCurveTo(cx - 8, ry + 1, cx - 6, ry + 3);
    ctx.moveTo(cx, ry);
    ctx.quadraticCurveTo(cx + 8, ry + 1, cx + 6, ry + 3);
    ctx.stroke();
  }

  // Arms
  ctx.beginPath();
  ctx.moveTo(cx, cy - 2);
  ctx.lineTo(cx - 12, cy + 6);
  ctx.moveTo(cx, cy - 2);
  ctx.lineTo(cx + 12, cy + 6);
  ctx.stroke();

  // Sword in right hand
  wire(ctx, lighten(body, 0.35), 4);
  ctx.beginPath();
  ctx.moveTo(cx + 12, cy + 6);
  ctx.lineTo(cx + 14, cy - 8);
  ctx.stroke();
  // Crossguard
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy + 5);
  ctx.lineTo(cx + 14, cy + 7);
  ctx.stroke();

  // Pelvis
  wire(ctx, legs);
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 8);
  ctx.lineTo(cx, cy + 10);
  ctx.lineTo(cx + 6, cy + 8);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 8);
  ctx.lineTo(cx - 5, cy + 18);
  ctx.moveTo(cx + 6, cy + 8);
  ctx.lineTo(cx + 5, cy + 18);
  ctx.stroke();
}

export function drawSlime(ctx, cx, cy, t = 0, colors = { body: '#44dd44', eyes: '#88ff66', drip: '#44dd44' }) {
  const { body, eyes, drip } = colors;
  const wobble = Math.sin(t * 3), w2 = Math.sin(t * 3 + 1);
  wire(ctx, body, 8);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10 - wobble);
  ctx.bezierCurveTo(cx + 12 + w2 * 2, cy - 8, cx + 16 + wobble * 2, cy + 6, cx + 10 + w2, cy + 12);
  ctx.bezierCurveTo(cx + 4, cy + 16 + wobble, cx - 4, cy + 16 + wobble, cx - 10 - w2, cy + 12);
  ctx.bezierCurveTo(cx - 16 - wobble * 2, cy + 6, cx - 12 - w2 * 2, cy - 8, cx, cy - 10 - wobble);
  ctx.stroke();
  wire(ctx, lighten(body, 0.3), 4);
  ctx.beginPath(); ctx.moveTo(cx - 2, cy - 6); ctx.bezierCurveTo(cx + 6 + w2, cy - 5, cx + 8, cy + 2, cx + 4, cy + 5); ctx.stroke();
  wire(ctx, eyes, 6);
  ctx.beginPath(); ctx.arc(cx - 4, cy - 2, 2.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + 4, cy - 2, 2.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - 4, cy - 1.5, 1, 0, Math.PI * 2); ctx.arc(cx + 4, cy - 1.5, 1, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, drip, 6);
  const dp = (t * 1.5) % 1;
  ctx.globalAlpha = 1 - dp;
  ctx.beginPath(); ctx.arc(cx + 10 + w2, cy + 13 + dp * 6, 1.5, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawGhost(ctx, cx, cy, t = 0, colors = { shroud: '#8899cc', eyes: '#bbccee', wisp: '#667799' }) {
  const { shroud, eyes, wisp } = colors;
  const floatY = Math.sin(t * 2) * 3, fy = cy + floatY;
  ctx.globalAlpha = 0.5 + Math.sin(t * 1.5) * 0.2;
  wire(ctx, shroud, 10);
  ctx.beginPath(); ctx.arc(cx, fy - 6, 10, Math.PI, 0); ctx.lineTo(cx + 10, fy + 6);
  const w = Math.sin(t * 4);
  ctx.bezierCurveTo(cx + 8, fy + 10 + w * 2, cx + 4, fy + 8, cx + 2, fy + 12 + w);
  ctx.bezierCurveTo(cx, fy + 8 - w, cx - 2, fy + 12 - w, cx - 4, fy + 8);
  ctx.bezierCurveTo(cx - 6, fy + 12 + w * 2, cx - 8, fy + 10 - w, cx - 10, fy + 6);
  ctx.closePath(); ctx.stroke();
  wire(ctx, eyes, 12);
  ctx.beginPath(); ctx.ellipse(cx - 4, fy - 6, 2.5, 3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx + 4, fy - 6, 2.5, 3, 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, shroud, 6);
  ctx.beginPath(); ctx.ellipse(cx, fy + 1, 2.5, 3 + Math.sin(t * 3), 0, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, wisp, 4); ctx.globalAlpha *= 0.5;
  for (let i = 0; i < 3; i++) {
    const wa = t * 2 + i * 1.5;
    ctx.beginPath(); ctx.moveTo(cx + (i - 1) * 6, fy + 10);
    ctx.bezierCurveTo(cx + (i - 1) * 6 + Math.sin(wa) * 3, fy + 14, cx + (i - 1) * 6 + Math.sin(wa + 1) * 4, fy + 18, cx + (i - 1) * 6 + Math.sin(wa + 2) * 5, fy + 22);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawDragon(ctx, cx, cy, t = 0, colors = { head: '#ff4422', body: '#ff4422', wings: '#ff8855' }) {
  const { head, body, wings } = colors;
  wire(ctx, head);
  ctx.beginPath(); ctx.moveTo(cx - 4, cy - 18); ctx.lineTo(cx + 4, cy - 18); ctx.lineTo(cx + 6, cy - 14); ctx.lineTo(cx + 4, cy - 10); ctx.lineTo(cx - 4, cy - 10); ctx.lineTo(cx - 6, cy - 14); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 4, cy - 18); ctx.lineTo(cx - 8, cy - 22); ctx.moveTo(cx + 4, cy - 18); ctx.lineTo(cx + 8, cy - 22); ctx.stroke();
  wire(ctx, '#ffcc00', 8);
  ctx.beginPath(); ctx.arc(cx - 2, cy - 15, 1.2, 0, Math.PI * 2); ctx.arc(cx + 2, cy - 15, 1.2, 0, Math.PI * 2); ctx.stroke();
  wire(ctx, body);
  ctx.beginPath(); ctx.moveTo(cx - 3, cy - 10); ctx.lineTo(cx - 4, cy - 4); ctx.moveTo(cx + 3, cy - 10); ctx.lineTo(cx + 4, cy - 4); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 8, 6, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx - 6, cy + 3); ctx.lineTo(cx + 6, cy + 3); ctx.stroke();
  const tw = Math.sin(t * 2) * 3, tw2 = Math.sin(t * 2 + 1) * 2;
  ctx.beginPath(); ctx.moveTo(cx, cy + 8); ctx.bezierCurveTo(cx + tw, cy + 12, cx + tw2, cy + 16, cx + tw * 1.5, cy + 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + tw * 1.5 - 2, cy + 19); ctx.lineTo(cx + tw * 1.5, cy + 22); ctx.lineTo(cx + tw * 1.5 + 2, cy + 19); ctx.stroke();
  const flap = Math.sin(t * 4) * 0.25;
  wire(ctx, wings, 5);
  ctx.save(); ctx.translate(cx - 8, cy - 2); ctx.rotate(-0.3 + flap);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -8); ctx.lineTo(-18, -2); ctx.lineTo(-12, 2); ctx.lineTo(0, 0); ctx.moveTo(0, 0); ctx.lineTo(-14, -4); ctx.moveTo(0, 0); ctx.lineTo(-10, -6); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(cx + 8, cy - 2); ctx.rotate(0.3 - flap);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, -8); ctx.lineTo(18, -2); ctx.lineTo(12, 2); ctx.lineTo(0, 0); ctx.moveTo(0, 0); ctx.lineTo(14, -4); ctx.moveTo(0, 0); ctx.lineTo(10, -6); ctx.stroke(); ctx.restore();
}

export function drawKnight(ctx, cx, cy, t = 0, colors = { helmet: '#aabbcc', plate: '#aabbcc', limbs: '#aabbcc' }) {
  const { helmet, plate, limbs } = colors;

  // Helmet — rounded top with visor slit
  wire(ctx, helmet);
  ctx.beginPath();
  ctx.arc(cx, cy - 13, 7, Math.PI, 0);
  ctx.lineTo(cx + 7, cy - 8);
  ctx.lineTo(cx - 7, cy - 8);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 10);
  ctx.lineTo(cx + 4, cy - 10);
  ctx.stroke();
  // Helmet crest
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy - 15);
  ctx.stroke();

  // Pauldrons + chest plate
  wire(ctx, plate);
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 4, 5, -Math.PI * 0.8, Math.PI * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 11, cy - 4, 5, Math.PI * 0.7, Math.PI * 1.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 8, cy + 2);
  ctx.lineTo(cx, cy + 10);
  ctx.lineTo(cx - 8, cy + 2);
  ctx.closePath();
  ctx.stroke();
  // Cross emblem
  wire(ctx, lighten(plate, 0.35), 3);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 7);
  ctx.moveTo(cx - 4, cy + 2); ctx.lineTo(cx + 4, cy + 2);
  ctx.stroke();

  // Arms + legs + shield + sword
  wire(ctx, limbs);
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy); ctx.lineTo(cx - 14, cy + 6); ctx.lineTo(cx - 12, cy + 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 11, cy); ctx.lineTo(cx + 14, cy + 6); ctx.lineTo(cx + 12, cy + 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 10); ctx.lineTo(cx - 6, cy + 18); ctx.lineTo(cx - 8, cy + 20);
  ctx.moveTo(cx + 4, cy + 10); ctx.lineTo(cx + 6, cy + 18); ctx.lineTo(cx + 8, cy + 20);
  ctx.stroke();
  // Shield
  wire(ctx, lighten(limbs, 0.3), 5);
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 2); ctx.lineTo(cx - 20, cy + 5);
  ctx.lineTo(cx - 18, cy + 12); ctx.lineTo(cx - 14, cy + 9);
  ctx.closePath();
  ctx.stroke();
  // Sword (animated swing)
  wire(ctx, lighten(limbs, 0.5), 6);
  const sAngle = Math.sin(t * 2) * 0.15;
  ctx.save();
  ctx.translate(cx + 14, cy + 6);
  ctx.rotate(-0.6 + sAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, -16);
  ctx.moveTo(-3, -3); ctx.lineTo(3, -3);
  ctx.stroke();
  ctx.restore();
}

export function drawZombie(ctx, cx, cy, t = 0, col) {
  const flesh=(col?.flesh??'#88aa66'), rot=(col?.rot??'#445533'), rags=(col?.rags??'#556644');
  const sway=Math.sin(t*2)*3;
  wire(ctx, flesh, 6);
  ctx.beginPath(); ctx.arc(cx+sway*0.3,cy-14,7,0,Math.PI*2); ctx.stroke();
  wire(ctx, rot, 4);
  ctx.beginPath();
  ctx.moveTo(cx-3+sway*0.3,cy-16); ctx.lineTo(cx-1+sway*0.3,cy-14);
  ctx.moveTo(cx-1+sway*0.3,cy-16); ctx.lineTo(cx-3+sway*0.3,cy-14);
  ctx.moveTo(cx+3+sway*0.3,cy-16); ctx.lineTo(cx+5+sway*0.3,cy-14);
  ctx.moveTo(cx+5+sway*0.3,cy-16); ctx.lineTo(cx+3+sway*0.3,cy-14);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-3+sway*0.3,cy-10); ctx.lineTo(cx+3+sway*0.3,cy-10);
  for(let i=-2;i<=2;i++){ctx.moveTo(cx+i*1.2+sway*0.3,cy-10);ctx.lineTo(cx+i*1.2+sway*0.3,cy-8.5);} ctx.stroke();
  wire(ctx, flesh, 4);
  ctx.beginPath(); ctx.moveTo(cx+sway*0.3,cy-7); ctx.lineTo(cx+sway,cy+5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-4+sway*0.3,cy-5); ctx.lineTo(cx+4+sway*0.3,cy-5); ctx.stroke();
  wire(ctx, rags, 5);
  ctx.beginPath();
  ctx.moveTo(cx-4+sway*0.3,cy-4); ctx.lineTo(cx-8+sway,cy+8); ctx.lineTo(cx-4+sway,cy+14);
  ctx.moveTo(cx+4+sway*0.3,cy-4); ctx.lineTo(cx+8+sway,cy+8); ctx.lineTo(cx+4+sway,cy+14); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-6+sway*0.3,cy-4); ctx.lineTo(cx-10+sway,cy+2);
  ctx.moveTo(cx+6+sway*0.3,cy-4); ctx.lineTo(cx+10+sway,cy+2); ctx.stroke();
  wire(ctx, flesh, 4);
  ctx.beginPath();
  ctx.moveTo(cx-2+sway,cy+5); ctx.lineTo(cx-4+sway,cy+16); ctx.lineTo(cx-8+sway,cy+20);
  ctx.moveTo(cx+2+sway,cy+5); ctx.lineTo(cx+4+sway,cy+18); ctx.lineTo(cx+6+sway,cy+21); ctx.stroke();
}

export function drawSpider(ctx, cx, cy, t = 0, col) {
  const body=(col?.body??'#222244'), legs=(col?.legs??'#334455'), eyes=(col?.eyes??'#ff2200');
  const skitter=Math.sin(t*6)*1.5;
  wire(ctx, body, 8);
  ctx.beginPath(); ctx.ellipse(cx,cy+6,8,6,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx,cy-4,5,4,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,cy-8); ctx.lineTo(cx,cy); ctx.stroke();
  wire(ctx, legs, 4);
  for(let i=0;i<4;i++){
    const sk=i%2===0?skitter:-skitter;
    ctx.beginPath(); ctx.moveTo(cx-5,cy-2+i*3); ctx.lineTo(cx-12-i,cy-4+i*4+sk); ctx.lineTo(cx-16-i,cy+i*3+sk); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+5,cy-2+i*3); ctx.lineTo(cx+12+i,cy-4+i*4-sk); ctx.lineTo(cx+16+i,cy+i*3-sk); ctx.stroke();
  }
  wire(ctx, eyes, 8);
  dots(ctx, [[cx-3,cy-5],[cx,cy-5],[cx+3,cy-5]], 1);
  eyePair(ctx, cx, cy-7, 2, 0.8);
}

export function drawBat(ctx, cx, cy, t = 0, col) {
  const body=(col?.body??'#553366'), wings=(col?.wings??'#442255'), eyes=(col?.eyes??'#ff4466');
  const flap=Math.sin(t*8)*0.4, floatY=Math.sin(t*3)*2, fy=cy+floatY;
  wire(ctx, body, 6);
  ctx.beginPath(); ctx.ellipse(cx,fy,4,5,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-3,fy-5); ctx.lineTo(cx-5,fy-11); ctx.lineTo(cx-1,fy-5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+3,fy-5); ctx.lineTo(cx+5,fy-11); ctx.lineTo(cx+1,fy-5); ctx.stroke();
  wire(ctx, wings, 5);
  ctx.save(); ctx.translate(cx-4,fy-2); ctx.rotate(flap);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-18,-4+flap*6); ctx.lineTo(-14,4); ctx.lineTo(-8,2); ctx.lineTo(0,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-14,4); ctx.lineTo(-18,-4+flap*6); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(cx+4,fy-2); ctx.rotate(-flap);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(18,-4-flap*6); ctx.lineTo(14,4); ctx.lineTo(8,2); ctx.lineTo(0,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14,4); ctx.lineTo(18,-4-flap*6); ctx.stroke(); ctx.restore();
  wire(ctx, eyes, 8);
  eyePair(ctx, cx, fy-1, 2, 1.5);
}

export function drawWraith(ctx, cx, cy, t = 0, col) {
  const form=(col?.form??'#334466'), tendrils=(col?.tendrils??'#223355'), core=(col?.core??'#6688ff');
  const floatY=Math.sin(t*1.8)*4, fy=cy+floatY;
  ctx.globalAlpha=0.45+Math.sin(t*2)*0.15;
  wire(ctx, form, 12);
  ctx.beginPath(); ctx.arc(cx,fy-8,9,Math.PI,0); ctx.lineTo(cx+9,fy+4);
  const w=Math.sin(t*3);
  ctx.bezierCurveTo(cx+7,fy+10+w,cx+3,fy+8,cx+1,fy+14+w*2);
  ctx.bezierCurveTo(cx,fy+10,cx,fy+10,cx,fy+16);
  ctx.bezierCurveTo(cx,fy+10,cx-1,fy+10,cx-1,fy+14-w*2);
  ctx.bezierCurveTo(cx-3,fy+8,cx-7,fy+10-w,cx-9,fy+4);
  ctx.closePath(); ctx.stroke();
  wire(ctx, core, 16); ctx.globalAlpha=0.7+Math.sin(t*3)*0.2;
  eyePair(ctx, cx, fy-8, 3, 1.7);
  wire(ctx, tendrils, 4); ctx.globalAlpha=0.3;
  for(let i=0;i<4;i++){
    const ta=t*1.5+i*1.2;
    ctx.beginPath(); ctx.moveTo(cx+(i-1.5)*5,fy+16);
    ctx.bezierCurveTo(cx+(i-1.5)*5+Math.sin(ta)*4,fy+20,cx+(i-1.5)*5+Math.sin(ta+1)*6,fy+25,cx+(i-1.5)*5+Math.sin(ta+2)*8,fy+30); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

export function drawGolem(ctx, cx, cy, t = 0, col) {
  const stone=(col?.stone??'#667788'), eyes=(col?.eyes??'#88ffcc'), bolt=(col?.bolt??'#44aaff');
  const rumble=Math.sin(t*4)*0.5;
  wire(ctx, stone, 5);
  ctx.beginPath(); ctx.rect(cx-8,cy-22,16,14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-8,cy-18); ctx.lineTo(cx+8,cy-18); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx-12+rumble,cy-8,24,18); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx-6,cy-8,12,4); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx-20+rumble,cy-6,8,12); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx+12-rumble,cy-6,8,12); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx-10+rumble,cy+10,8,12); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx+2-rumble,cy+10,8,12); ctx.stroke();
  wire(ctx, eyes, 10); ctx.globalAlpha=Math.sin(t*2)*0.3+0.7;
  eyePair(ctx, cx, cy-16, 3, 2);
  ctx.globalAlpha=1;
  wire(ctx, bolt, 6); ctx.globalAlpha=0.75+Math.sin(t*3)*0.2;
  zigzag(ctx, [cx-10+rumble,cy-6, cx-5,cy-2, cx-7,cy+2, cx-2,cy+6, cx-4,cy+9]);
  ctx.globalAlpha=0.75+Math.sin(t*3+1)*0.2;
  zigzag(ctx, [cx+4,cy-8, cx+8,cy-4, cx+6,cy-1, cx+11-rumble,cy+3, cx+9,cy+6]);
  ctx.globalAlpha=1;
}

// Shared orc head — ellipse skull, brow, tusks, red eyes.
function drawOrcHead(ctx, cx, cy, skin) {
  wire(ctx, skin, 6);
  ctx.beginPath(); ctx.ellipse(cx,cy-14,7,8,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-8,cy-18); ctx.lineTo(cx+8,cy-18); ctx.stroke();
  wire(ctx, lighten(skin,0.4), 4);
  ctx.beginPath(); ctx.moveTo(cx-3,cy-10); ctx.lineTo(cx-4,cy-6); ctx.moveTo(cx+3,cy-10); ctx.lineTo(cx+4,cy-6); ctx.stroke();
  wire(ctx, '#ff4400', 6);
  eyePair(ctx, cx, cy-16, 3, 1.5);
}

export function drawOrcWarrior(ctx, cx, cy, t = 0, col) {
  const skin=(col?.skin??'#44aa55'), armor=(col?.armor??'#887766'), weapon=(col?.weapon??'#aabbcc');
  const sway=Math.sin(t*2)*2;
  drawOrcHead(ctx, cx, cy, skin);
  wire(ctx, armor, 5);
  ctx.beginPath(); ctx.moveTo(cx-8,cy-6); ctx.lineTo(cx-10,cy+8); ctx.lineTo(cx+10,cy+8); ctx.lineTo(cx+8,cy-6); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-8,cy-2); ctx.lineTo(cx+8,cy-2); ctx.moveTo(cx-8,cy+4); ctx.lineTo(cx+8,cy+4); ctx.stroke();
  wire(ctx, skin, 4);
  ctx.beginPath(); ctx.moveTo(cx-8,cy-4+sway); ctx.lineTo(cx-14,cy+2); ctx.lineTo(cx-12,cy+8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+8,cy-4-sway); ctx.lineTo(cx+14,cy+2); ctx.lineTo(cx+12,cy+8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-4,cy+8); ctx.lineTo(cx-5,cy+20); ctx.moveTo(cx+4,cy+8); ctx.lineTo(cx+5,cy+20); ctx.stroke();
  wire(ctx, weapon, 6);
  const wAngle=Math.sin(t*2)*0.1;
  ctx.save(); ctx.translate(cx+14,cy+2); ctx.rotate(0.3+wAngle);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(-6,-16); ctx.lineTo(-5,-8); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

export function drawOrcKnight(ctx, cx, cy, t = 0, col) {
  const skin=(col?.skin??'#44aa55'), plate=(col?.plate??'#bbccdd'), shield=(col?.shield??'#aa3322');
  const sway=Math.sin(t*1.8)*1.2;
  drawOrcHead(ctx, cx, cy, skin);
  wire(ctx, plate, 5);
  ctx.beginPath(); ctx.arc(cx,cy-18,8,Math.PI,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-8,cy-18); ctx.lineTo(cx-8,cy-14); ctx.moveTo(cx+8,cy-18); ctx.lineTo(cx+8,cy-14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-6,cy-22); ctx.lineTo(cx-10,cy-26); ctx.moveTo(cx+6,cy-22); ctx.lineTo(cx+10,cy-26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,cy-17); ctx.lineTo(cx,cy-11); ctx.stroke();
  wire(ctx, plate, 6);
  ctx.beginPath(); ctx.arc(cx-10,cy-5,5,Math.PI,0); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx+10,cy-5,5,Math.PI,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-9,cy-4); ctx.lineTo(cx-11,cy+10); ctx.lineTo(cx+11,cy+10); ctx.lineTo(cx+9,cy-4); ctx.closePath(); ctx.stroke();
  wire(ctx, lighten(plate,0.2), 3);
  ctx.beginPath(); ctx.moveTo(cx,cy-3); ctx.lineTo(cx,cy+10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-9,cy+2); ctx.lineTo(cx+9,cy+2); ctx.stroke();
  wire(ctx, plate, 4);
  ctx.beginPath(); ctx.rect(cx-6,cy+10,5,12); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx+1,cy+10,5,12); ctx.stroke();
  wire(ctx, skin, 4);
  ctx.beginPath(); ctx.moveTo(cx+10,cy-2); ctx.lineTo(cx+14,cy+4+sway); ctx.stroke();
  wire(ctx, plate, 5);
  ctx.beginPath(); ctx.moveTo(cx+14,cy+4+sway); ctx.lineTo(cx+14,cy-14+sway); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+10,cy-6+sway); ctx.lineTo(cx+18,cy-6+sway); ctx.stroke();
  wire(ctx, skin, 4);
  ctx.beginPath(); ctx.moveTo(cx-10,cy-2); ctx.lineTo(cx-14,cy+2); ctx.stroke();
  wire(ctx, shield, 6);
  ctx.beginPath();
  ctx.moveTo(cx-14,cy-8); ctx.lineTo(cx-22,cy-6); ctx.lineTo(cx-22,cy+6); ctx.lineTo(cx-18,cy+14); ctx.lineTo(cx-14,cy+14); ctx.lineTo(cx-10,cy+6); ctx.lineTo(cx-10,cy-6); ctx.closePath();
  ctx.stroke();
  wire(ctx, lighten(shield,0.3), 5);
  ctx.beginPath(); ctx.arc(cx-16,cy+2,2,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-16,cy-4); ctx.lineTo(cx-16,cy+8); ctx.moveTo(cx-20,cy+2); ctx.lineTo(cx-12,cy+2); ctx.stroke();
}

export function drawOrcMage(ctx, cx, cy, t = 0, col) {
  const skin=(col?.skin??'#44aa55'), robe=(col?.robe??'#335522'), magic=(col?.magic??'#aaff66');
  const sway=Math.sin(t*1.8)*1.5;
  drawOrcHead(ctx, cx, cy, skin);
  wire(ctx, robe, 5);
  ctx.beginPath(); ctx.moveTo(cx-7,cy-6); ctx.lineTo(cx-13+sway*0.3,cy+18); ctx.lineTo(cx+13-sway*0.3,cy+18); ctx.lineTo(cx+7,cy-6); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-13,cy+18); ctx.lineTo(cx-15,cy+22); ctx.moveTo(cx,cy+18); ctx.lineTo(cx,cy+22); ctx.moveTo(cx+13,cy+18); ctx.lineTo(cx+15,cy+22); ctx.stroke();
  wire(ctx, lighten(robe,0.2), 3);
  ctx.beginPath(); ctx.moveTo(cx-8,cy); ctx.lineTo(cx+8,cy); ctx.moveTo(cx-10,cy+8); ctx.lineTo(cx+10,cy+8); ctx.stroke();
  wire(ctx, '#664422', 4);
  ctx.beginPath(); ctx.moveTo(cx-14,cy-18); ctx.lineTo(cx-14,cy+18); ctx.stroke();
  wire(ctx, magic, 12+Math.sin(t*3)*1.5); ctx.globalAlpha=0.75+Math.sin(t*2)*0.2;
  ctx.beginPath(); ctx.arc(cx-14,cy-20,3.5,0,Math.PI*2); ctx.stroke();
  wire(ctx, magic, 4); ctx.globalAlpha=0.55;
  orbit(ctx, cx, cy-4, 3, t, 10, 10, 1.5, 1);
  ctx.globalAlpha=1;
}

export function drawDarkWizard(ctx, cx, cy, t = 0, col) {
  const robe=(col?.robe??'#220033'), staff=(col?.staff??'#aa6633'), magic=(col?.magic??'#ff22ff');
  wire(ctx, robe, 6);
  ctx.beginPath(); ctx.moveTo(cx-3,cy-8); ctx.lineTo(cx-14,cy+16); ctx.lineTo(cx+14,cy+16); ctx.lineTo(cx+3,cy-8); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-14,cy+16); ctx.lineTo(cx-16,cy+22); ctx.moveTo(cx+14,cy+16); ctx.lineTo(cx+16,cy+22); ctx.stroke();
  wire(ctx, lighten(robe,0.2), 3);
  ctx.beginPath(); ctx.moveTo(cx-3,cy-4); ctx.lineTo(cx+3,cy-4); ctx.moveTo(cx-6,cy+2); ctx.lineTo(cx+6,cy+2); ctx.moveTo(cx-8,cy+8); ctx.lineTo(cx+8,cy+8); ctx.stroke();
  wire(ctx, robe, 5);
  ctx.beginPath(); ctx.moveTo(cx-7,cy-8); ctx.lineTo(cx,cy-20); ctx.lineTo(cx+7,cy-8); ctx.closePath(); ctx.stroke();
  wire(ctx, magic, 6); ctx.globalAlpha=0.6;
  ctx.beginPath(); ctx.arc(cx,cy-12,3,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
  wire(ctx, staff, 4);
  ctx.beginPath(); ctx.moveTo(cx+16,cy-14); ctx.lineTo(cx+16,cy+18); ctx.stroke();
  wire(ctx, magic, 14);
  const pulse=Math.sin(t*3)*1;
  ctx.beginPath(); ctx.arc(cx+16,cy-16,4+pulse*0.5,0,Math.PI*2); ctx.stroke();
  wire(ctx, magic, 4); ctx.globalAlpha=0.2+Math.sin(t*2)*0.1;
  orbit(ctx, cx, cy, 3, t, 12, 12, 2, 1);
  ctx.globalAlpha=1;
}

export function drawRat(ctx, cx, cy, t = 0, col) {
  const body=(col?.body??'#887766'), tail=(col?.tail??'#665544'), eyes=(col?.eyes??'#ff2200');
  const sniff=Math.sin(t*8)*2, scurry=Math.sin(t*10)*1;
  wire(ctx, body, 5);
  ctx.beginPath(); ctx.ellipse(cx-2,cy+4,10,6,0.2,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx+8,cy+2,5,4,-0.3,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+12,cy+2); ctx.lineTo(cx+15+sniff*0.5,cy+2+sniff*0.3); ctx.stroke();
  wire(ctx, lighten(body,0.2), 3);
  ctx.beginPath(); ctx.arc(cx+6,cy-2,2.5,0,Math.PI*2); ctx.stroke();
  wire(ctx, eyes, 6);
  ctx.beginPath(); ctx.arc(cx+10,cy,1,0,Math.PI*2); ctx.stroke();
  wire(ctx, body, 3);
  ctx.beginPath();
  ctx.moveTo(cx-4,cy+8+scurry); ctx.lineTo(cx-6,cy+14);
  ctx.moveTo(cx,cy+8-scurry); ctx.lineTo(cx,cy+14);
  ctx.moveTo(cx+4,cy+6+scurry); ctx.lineTo(cx+4,cy+12); ctx.stroke();
  wire(ctx, tail, 3);
  ctx.beginPath(); ctx.moveTo(cx-10,cy+4);
  ctx.bezierCurveTo(cx-16,cy+2,cx-20,cy+8+sniff,cx-18,cy+14+sniff); ctx.stroke();
  wire(ctx, lighten(body,0.3), 2);
  ctx.beginPath();
  ctx.moveTo(cx+12,cy); ctx.lineTo(cx+20,cy-2+sniff*0.5);
  ctx.moveTo(cx+12,cy+2); ctx.lineTo(cx+20,cy+3+sniff*0.5);
  ctx.moveTo(cx+12,cy+1); ctx.lineTo(cx+20,cy+1); ctx.stroke();
}

export function drawTroll(ctx, cx, cy, t = 0, col) {
  const hide=(col?.hide??'#557755'), eyes=(col?.eyes??'#ffcc00'), face=(col?.face??'#446644');
  const breathe=Math.sin(t*1.5)*1.5, stomp=Math.abs(Math.sin(t*2))*2;
  wire(ctx, hide, 6);
  ctx.beginPath(); ctx.ellipse(cx,cy+2+breathe*0.3,14,12,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx,cy-14,8,7,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(hide,0.15), 4);
  ctx.beginPath(); ctx.arc(cx,cy-2,10,Math.PI*1.2,Math.PI*1.8); ctx.stroke();
  wire(ctx, hide, 5);
  ctx.beginPath(); ctx.moveTo(cx-12,cy-4); ctx.bezierCurveTo(cx-16,cy+4,cx-18,cy+12,cx-16,cy+20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+12,cy-4); ctx.bezierCurveTo(cx+16,cy+4,cx+18,cy+12,cx+16,cy+20); ctx.stroke();
  wire(ctx, hide, 5);
  ctx.beginPath(); ctx.moveTo(cx-6,cy+14); ctx.lineTo(cx-7,cy+22+stomp); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+6,cy+14); ctx.lineTo(cx+7,cy+22-stomp); ctx.stroke();
  wire(ctx, face, 4);
  ctx.beginPath(); ctx.moveTo(cx-6,cy-16); ctx.lineTo(cx+6,cy-16); ctx.stroke();
  wire(ctx, eyes, 10); ctx.globalAlpha=0.8+Math.sin(t*2.5)*0.15;
  eyePair(ctx, cx, cy-15, 3, 2);
  ctx.globalAlpha=1;
  wire(ctx, face, 3);
  ctx.beginPath(); ctx.arc(cx-2,cy-11,1,0,Math.PI*2); ctx.arc(cx+2,cy-11,1,0,Math.PI*2); ctx.stroke();
}

export function drawVampire(ctx, cx, cy, t = 0, col) {
  const cape=(col?.cape??'#220011'), face=(col?.face??'#ddeeff'), eyes=(col?.eyes??'#ff0033');
  const breathe=Math.sin(t*1.5)*1;
  wire(ctx, cape, 6);
  ctx.beginPath(); ctx.moveTo(cx-4,cy-6); ctx.lineTo(cx-18,cy+8+breathe); ctx.lineTo(cx-14,cy+20); ctx.lineTo(cx,cy+14); ctx.lineTo(cx+14,cy+20); ctx.lineTo(cx+18,cy+8+breathe); ctx.lineTo(cx+4,cy-6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-4,cy-2); ctx.lineTo(cx,cy+10); ctx.lineTo(cx+4,cy-2); ctx.stroke();
  wire(ctx, face, 5);
  ctx.beginPath(); ctx.ellipse(cx,cy-13,5,6,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-5,cy-18); ctx.lineTo(cx,cy-20); ctx.lineTo(cx+5,cy-18); ctx.stroke();
  wire(ctx, lighten(face,0.2), 3);
  lines(ctx, [[cx-2,cy-9,cx-2,cy-6],[cx+2,cy-9,cx+2,cy-6]]);
  wire(ctx, eyes, 10);
  eyePair(ctx, cx, cy-14, 2.5, 1.5);
  wire(ctx, face, 4);
  lines(ctx, [[cx-4,cy+14,cx-5,cy+22],[cx+4,cy+14,cx+5,cy+22],[cx-8,cy+22,cx-5,cy+22],[cx+5,cy+22,cx+8,cy+22]]);
}

export function drawMushroom(ctx, cx, cy, t = 0, col) {
  const cap=(col?.cap??'#cc4422'), stalk=(col?.stalk??'#ddcc99'), spores=(col?.spores??'#ffeeaa');
  const sway=Math.sin(t*2)*1;
  wire(ctx, stalk, 4);
  ctx.beginPath(); ctx.moveTo(cx-3,cy+12); ctx.lineTo(cx-2+sway,cy); ctx.moveTo(cx+3,cy+12); ctx.lineTo(cx+2+sway,cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-3,cy+12); ctx.lineTo(cx+3,cy+12); ctx.stroke();
  wire(ctx, lighten(stalk,0.2), 2);
  ctx.beginPath(); ctx.ellipse(cx+sway,cy,5,2,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, cap, 6);
  ctx.beginPath(); ctx.arc(cx+sway,cy-5,8,Math.PI,0); ctx.lineTo(cx+sway+9,cy-1); ctx.bezierCurveTo(cx+sway+6,cy+2,cx+sway-6,cy+2,cx+sway-9,cy-1); ctx.closePath(); ctx.stroke();
  wire(ctx, spores, 3);
  dots(ctx, [[cx+sway-3,cy-7],[cx+sway+3,cy-8],[cx+sway+1,cy-4]], 1.1);
  wire(ctx, spores, 2); ctx.globalAlpha=0.5+Math.sin(t*2)*0.3;
  orbit(ctx, cx+sway, cy-11, 3, t, 7, 3, 1, 0.7);
  ctx.globalAlpha=1;
}

export function drawGargoyle(ctx, cx, cy, t = 0, col) {
  const stone=(col?.stone??'#778899'), wings=(col?.wings??'#556677'), eyes=(col?.eyes??'#ff4400');
  const crouch=Math.abs(Math.sin(t*1))*1;
  wire(ctx, wings, 5);
  ctx.save(); ctx.translate(cx-10,cy-4); ctx.rotate(-0.2);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-12,-10); ctx.lineTo(-14,2); ctx.lineTo(-8,8); ctx.lineTo(0,4); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(cx+10,cy-4); ctx.rotate(0.2);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(12,-10); ctx.lineTo(14,2); ctx.lineTo(8,8); ctx.lineTo(0,4); ctx.stroke(); ctx.restore();
  wire(ctx, stone, 5);
  ctx.beginPath(); ctx.ellipse(cx,cy+4+crouch,9,8,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx,cy-10,7,6,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-5,cy-14); ctx.lineTo(cx-6,cy-20); ctx.moveTo(cx+5,cy-14); ctx.lineTo(cx+6,cy-20); ctx.stroke();
  wire(ctx, lighten(stone,0.15), 3);
  ctx.beginPath(); ctx.moveTo(cx-8,cy+12+crouch); ctx.lineTo(cx-12,cy+18); ctx.moveTo(cx-8,cy+12+crouch); ctx.lineTo(cx-8,cy+18); ctx.moveTo(cx-8,cy+12+crouch); ctx.lineTo(cx-4,cy+18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+8,cy+12+crouch); ctx.lineTo(cx+12,cy+18); ctx.moveTo(cx+8,cy+12+crouch); ctx.lineTo(cx+8,cy+18); ctx.moveTo(cx+8,cy+12+crouch); ctx.lineTo(cx+4,cy+18); ctx.stroke();
  wire(ctx, eyes, 10);
  eyePair(ctx, cx, cy-11, 3, 1.5);
}

export function drawLich(ctx, cx, cy, t = 0, col) {
  const robe=(col?.robe??'#1a0033'), skull=(col?.skull??'#ccddaa'), staff=(col?.staff??'#8833ff');
  wire(ctx, robe, 5);
  ctx.beginPath(); ctx.moveTo(cx-4,cy-8); ctx.lineTo(cx-14,cy+16); ctx.lineTo(cx-16,cy+22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+4,cy-8); ctx.lineTo(cx+14,cy+16); ctx.lineTo(cx+16,cy+22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-14,cy+16); ctx.lineTo(cx-8,cy+20); ctx.lineTo(cx-2,cy+16); ctx.lineTo(cx+4,cy+20); ctx.lineTo(cx+10,cy+16); ctx.lineTo(cx+16,cy+22); ctx.stroke();
  wire(ctx, lighten(robe,0.15), 3);
  ctx.beginPath(); ctx.moveTo(cx-4,cy-4); ctx.lineTo(cx+4,cy-4); ctx.moveTo(cx-6,cy+3); ctx.lineTo(cx+6,cy+3); ctx.moveTo(cx-8,cy+10); ctx.lineTo(cx+8,cy+10); ctx.stroke();
  wire(ctx, skull, 4);
  ctx.beginPath(); ctx.moveTo(cx-4,cy); ctx.lineTo(cx-14,cy+4); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-14,cy+4); ctx.lineTo(cx-19,cy+1);
  ctx.moveTo(cx-14,cy+4); ctx.lineTo(cx-19,cy+5);
  ctx.moveTo(cx-14,cy+4); ctx.lineTo(cx-17,cy+9);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+4,cy); ctx.lineTo(cx+14,cy+2); ctx.stroke();
  wire(ctx, staff, 4);
  ctx.beginPath(); ctx.moveTo(cx+18,cy-20); ctx.lineTo(cx+18,cy+22); ctx.stroke();
  wire(ctx, staff, 14);
  const pulse=Math.sin(t*3)*1;
  ctx.beginPath(); ctx.arc(cx+18,cy-22,4+pulse*0.5,0,Math.PI*2); ctx.stroke();
  wire(ctx, skull, 6);
  ctx.beginPath(); ctx.arc(cx,cy-14,7,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-7,cy-18); ctx.lineTo(cx-7,cy-22); ctx.lineTo(cx-3,cy-19); ctx.lineTo(cx,cy-23); ctx.lineTo(cx+3,cy-19); ctx.lineTo(cx+7,cy-22); ctx.lineTo(cx+7,cy-18); ctx.stroke();
  wire(ctx, staff, 10); ctx.globalAlpha=0.7+Math.sin(t*3)*0.2;
  eyePair(ctx, cx, cy-15, 3, 1.8);
  ctx.globalAlpha=1;
}

export function drawSerpent(ctx, cx, cy, t = 0, col) {
  const scales=(col?.scales??'#227744'), hood=(col?.hood??'#33aa55'), eyes=(col?.eyes??'#ffee00');
  const sway=Math.sin(t*2.5)*4;
  wire(ctx, scales, 5);
  ctx.beginPath(); ctx.ellipse(cx,cy+14,10,5,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx+4,cy+12,6,3,0.3,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-3,cy+8); ctx.bezierCurveTo(cx-4+sway*0.3,cy+2,cx+sway,cy-6,cx+sway,cy-12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+3,cy+8); ctx.bezierCurveTo(cx+4+sway*0.3,cy+2,cx+6+sway,cy-6,cx+5+sway,cy-12); ctx.stroke();
  wire(ctx, hood, 7);
  ctx.beginPath(); ctx.ellipse(cx+sway+2,cy-14,12,6,0.1,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(hood,0.2), 3);
  ctx.beginPath(); ctx.moveTo(cx+sway-4,cy-14); ctx.lineTo(cx+sway-8,cy-12); ctx.moveTo(cx+sway+4,cy-14); ctx.lineTo(cx+sway+8,cy-12); ctx.stroke();
  wire(ctx, scales, 5);
  ctx.beginPath(); ctx.ellipse(cx+sway+2,cy-16,4,5,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, '#ff4444', 3);
  const lick=Math.sin(t*6)*1.5;
  ctx.beginPath(); ctx.moveTo(cx+sway+2,cy-12); ctx.lineTo(cx+sway+2,cy-9); ctx.lineTo(cx+sway-1+lick,cy-7); ctx.moveTo(cx+sway+2,cy-9); ctx.lineTo(cx+sway+5+lick,cy-7); ctx.stroke();
  wire(ctx, eyes, 8);
  eyePair(ctx, cx+sway+2, cy-17, 2, 1.2);
}

export function drawWisp(ctx, cx, cy, t = 0, col) {
  const core=(col?.core??'#aaddff'), halo=(col?.halo??'#5588bb'), sparks=(col?.sparks??'#eeffff');
  const pulse=Math.sin(t*4)*0.3+0.7, fy=cy+Math.sin(t*2.5)*4;
  wire(ctx, halo, 6); ctx.globalAlpha=0.15+Math.sin(t*3)*0.07;
  ctx.beginPath(); ctx.arc(cx,fy,16,0,Math.PI*2); ctx.stroke();
  wire(ctx, halo, 8); ctx.globalAlpha=0.25+Math.sin(t*2.5)*0.1;
  ctx.beginPath(); ctx.arc(cx,fy,10,0,Math.PI*2); ctx.stroke();
  wire(ctx, core, 16); ctx.globalAlpha=pulse;
  ctx.beginPath(); ctx.arc(cx,fy,5,0,Math.PI*2); ctx.stroke();
  wire(ctx, core, 6); ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(cx,fy,2,0,Math.PI*2); ctx.stroke();
  wire(ctx, sparks, 5); ctx.globalAlpha=0.75;
  orbit(ctx, cx, fy, 4, t, 11, 11, 2.2, 1.2);
  ctx.globalAlpha=1;
}

export function drawSkeletonArcher(ctx, cx, cy, t = 0, col) {
  const skull=(col?.skull??'#ccbb99'), limbs=(col?.limbs??'#ccbb99'), bow=(col?.bow??'#aa8833');
  const pull=Math.sin(t*1.5)*1.5;
  wire(ctx, skull, 6);
  ctx.beginPath(); ctx.arc(cx,cy-18,6,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-4,cy-13); ctx.lineTo(cx+4,cy-13); ctx.stroke();
  wire(ctx, limbs, 4);
  ctx.beginPath(); ctx.moveTo(cx,cy-12); ctx.lineTo(cx,cy+6);
  for(let i=0;i<3;i++){
    ctx.moveTo(cx,cy-10+i*4); ctx.lineTo(cx-4,cy-8+i*4);
    ctx.moveTo(cx,cy-10+i*4); ctx.lineTo(cx+5,cy-8+i*4);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+2,cy-8); ctx.lineTo(cx+14,cy-5); ctx.lineTo(cx+14,cy+1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-2,cy-8); ctx.lineTo(cx-7-pull,cy-4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-5,cy+6); ctx.lineTo(cx+5,cy+6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-3,cy+6); ctx.lineTo(cx-4,cy+14); ctx.lineTo(cx-3,cy+22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+3,cy+6); ctx.lineTo(cx+4,cy+14); ctx.lineTo(cx+3,cy+22); ctx.stroke();
  wire(ctx, bow, 5);
  ctx.beginPath(); ctx.moveTo(cx+14,cy-10); ctx.lineTo(cx+14,cy+8); ctx.stroke();
  wire(ctx, lighten(bow,0.5), 2);
  ctx.beginPath(); ctx.moveTo(cx+14,cy-10); ctx.lineTo(cx+7-pull,cy-2); ctx.lineTo(cx+14,cy+8); ctx.stroke();
  wire(ctx, skull, 2);
  ctx.beginPath(); ctx.moveTo(cx+7-pull,cy-2); ctx.lineTo(cx+11,cy-2); ctx.stroke();
  wire(ctx, '#cc5500', 4);
  ctx.beginPath(); ctx.moveTo(cx+11,cy-2); ctx.lineTo(cx+13,cy-4); ctx.lineTo(cx+13,cy); ctx.closePath(); ctx.stroke();
  wire(ctx, bow, 3);
  ctx.save(); ctx.translate(cx-8,cy-10); ctx.rotate(-0.2);
  ctx.beginPath(); ctx.rect(-2,0,4,10); ctx.stroke();
  for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-2+i*2,0);ctx.lineTo(-2+i*2,-5);ctx.stroke();}
  ctx.restore();
}

export function drawCrystalElemental(ctx, cx, cy, t = 0, col) {
  const crystal=(col?.crystal??'#88ccff'), core=(col?.core??'#eeffff'), edge=(col?.edge??'#4488bb');
  wire(ctx, crystal, 5);
  const pts=[[0,-20],[10,-12],[14,0],[8,14],[-4,18],[-14,8],[-12,-8],[-6,-18]];
  ctx.beginPath(); ctx.moveTo(cx+pts[0][0],cy+pts[0][1]);
  for(let i=1;i<pts.length;i++) ctx.lineTo(cx+pts[i][0],cy+pts[i][1]);
  ctx.closePath(); ctx.stroke();
  wire(ctx, edge, 3);
  ctx.beginPath(); ctx.moveTo(cx,cy-20); ctx.lineTo(cx+8,cy+8); ctx.lineTo(cx-14,cy+8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+10,cy-12); ctx.lineTo(cx-4,cy+18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-12,cy-8); ctx.lineTo(cx+14,cy); ctx.stroke();
  wire(ctx, core, 18); ctx.globalAlpha=0.65+Math.sin(t*3)*0.25;
  ctx.save(); ctx.translate(cx,cy-1); ctx.rotate(t*0.5);
  ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,0); ctx.lineTo(0,7); ctx.lineTo(-5,0); ctx.closePath(); ctx.stroke();
  ctx.restore();
  wire(ctx, core, 10); ctx.globalAlpha=1;
  ctx.beginPath(); ctx.arc(cx,cy-1,2,0,Math.PI*2); ctx.stroke();
  for(const [dx,dy,ph] of [[10,-12,0],[-14,8,1.5],[8,14,3]]){
    wire(ctx, core, 5); ctx.globalAlpha=0.3+Math.sin(t*5+ph)*0.4;
    ctx.beginPath(); ctx.arc(cx+dx,cy+dy,1,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

export function drawFireElemental(ctx, cx, cy, t = 0, col) {
  const flame=(col?.flame??'#ff4400'), ember=(col?.ember??'#ff8800'), core=(col?.core??'#ffdd00');
  const f1=Math.sin(t*6)*3, f2=Math.sin(t*7+1)*2;
  wire(ctx, flame, 8);
  ctx.beginPath(); ctx.ellipse(cx,cy+16,10,4,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, flame, 7);
  ctx.beginPath();
  ctx.moveTo(cx-10,cy+12);
  ctx.bezierCurveTo(cx-12+f1,cy,cx-8+f2,cy-10,cx-2+f1,cy-18);
  ctx.bezierCurveTo(cx+2+f2,cy-10,cx+10+f1,cy,cx+10,cy+12);
  ctx.stroke();
  wire(ctx, ember, 10);
  ctx.beginPath();
  ctx.moveTo(cx-5,cy+8);
  ctx.bezierCurveTo(cx-5+f1*0.5,cy,cx-1+f2*0.5,cy-8,cx+f1*0.3,cy-14);
  ctx.bezierCurveTo(cx+3+f2*0.5,cy-8,cx+7+f1*0.5,cy,cx+5,cy+8);
  ctx.stroke();
  wire(ctx, core, 16);
  ctx.beginPath(); ctx.ellipse(cx+f1*0.2,cy-4,3,5,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, ember, 4);
  for(let i=0;i<4;i++){
    const p=(t*2.5+i*0.7)%1, ex=cx+Math.sin(t*2+i*2.1)*7, ey=cy-8-p*22;
    ctx.globalAlpha=(1-p)*0.8; ctx.beginPath(); ctx.arc(ex,ey,1,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

export function drawWaterElemental(ctx, cx, cy, t = 0, col) {
  const water=(col?.water??'#2255aa'), foam=(col?.foam??'#66aadd'), core=(col?.core??'#aaddff');
  const w1=Math.sin(t*2), w2=Math.sin(t*2.5+1);
  ctx.globalAlpha=0.6;
  wire(ctx, water, 6);
  ctx.beginPath(); ctx.ellipse(cx,cy+18,12,4,0,0,Math.PI*2); ctx.stroke();
  wire(ctx, foam, 3);
  ctx.beginPath(); ctx.ellipse(cx+w1*2,cy+18,7,2.5,0.2,0,Math.PI*2); ctx.stroke();
  ctx.globalAlpha=1;
  wire(ctx, water, 5);
  for(let i=-1;i<=1;i++){
    const wv=Math.sin(t*2.5+i*1.2)*2;
    ctx.beginPath();
    ctx.moveTo(cx+i*5,cy+14);
    ctx.bezierCurveTo(cx+i*5+wv,cy+4, cx+i*5-wv,cy-4, cx+i*5+wv*0.5,cy-10);
    ctx.stroke();
  }
  wire(ctx, foam, 5);
  ctx.beginPath(); ctx.moveTo(cx-4,cy-2); ctx.bezierCurveTo(cx-10,cy-6+w1,cx-16,cy-4+w2,cx-18,cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+4,cy-2); ctx.bezierCurveTo(cx+10,cy-6-w1,cx+16,cy-4-w2,cx+18,cy); ctx.stroke();
  wire(ctx, water, 7);
  ctx.beginPath(); ctx.moveTo(cx-10,cy-12); ctx.bezierCurveTo(cx-8,cy-20+w1,cx+8,cy-20-w1,cx+10,cy-12); ctx.stroke();
  wire(ctx, foam, 5);
  ctx.beginPath(); ctx.moveTo(cx-6,cy-18+w1*0.5); ctx.bezierCurveTo(cx-2,cy-23,cx+4,cy-21,cx+8,cy-16); ctx.stroke();
  wire(ctx, core, 10); ctx.globalAlpha=0.8+Math.sin(t*3)*0.15;
  eyePair(ctx, cx, cy-14, 3, 1.8);
  ctx.globalAlpha=1;
  wire(ctx, foam, 3);
  for(let i=0;i<4;i++){
    const p=(t*2+i*0.65)%1, sx=cx+Math.sin(i*1.9)*9, sy=cy-20-p*12;
    ctx.globalAlpha=(1-p)*0.6; ctx.beginPath(); ctx.arc(sx,sy,1,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

export function drawAirElemental(ctx, cx, cy, t = 0, col) {
  const wind=(col?.wind??'#aaccee'), mist=(col?.mist??'#ddeeff'), core=(col?.core??'#ffffff');
  const spin=t*2;
  for(let i=0;i<3;i++){
    wire(ctx, wind, 3); ctx.globalAlpha=0.15+i*0.1;
    ctx.beginPath(); ctx.ellipse(cx,cy,16-i*3,(16-i*3)*0.35,spin+i*(Math.PI*2/3),0,Math.PI*2); ctx.stroke();
  }
  wire(ctx, mist, 4); ctx.globalAlpha=0.5;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a=spin+i*(Math.PI*2/6), r=10+Math.sin(t*3+i)*2;
    ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.5);
    ctx.lineTo(cx+Math.cos(a+0.9)*5,cy+Math.sin(a+0.9)*2.5);
  }
  ctx.stroke();
  wire(ctx, core, 12); ctx.globalAlpha=0.4+Math.sin(t*4)*0.2;
  ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.stroke();
  wire(ctx, mist, 3);
  for(let i=0;i<5;i++){
    const a=spin*1.5+i*(Math.PI*2/5), r=9+Math.sin(t*4+i)*4;
    ctx.globalAlpha=0.25+Math.sin(t*3+i)*0.3;
    ctx.beginPath(); ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.55,1,0,Math.PI*2); ctx.stroke();
  }
  ctx.globalAlpha=1;
}

export function drawEarthElemental(ctx, cx, cy, t = 0, col) {
  const stone=(col?.stone??'#887755'), crack=(col?.crack??'#553322'), lava=(col?.lava??'#ff8833');
  const rumble=Math.sin(t*4)*0.8, stomp=Math.abs(Math.sin(t*1.8))*2;
  wire(ctx, stone, 5);
  ctx.beginPath(); ctx.moveTo(cx-10,cy+12); ctx.lineTo(cx-13,cy+22+stomp); ctx.lineTo(cx-5,cy+22+stomp); ctx.lineTo(cx-3,cy+12); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+3,cy+12); ctx.lineTo(cx+5,cy+22-stomp*0.5); ctx.lineTo(cx+13,cy+22-stomp*0.5); ctx.lineTo(cx+10,cy+12); ctx.closePath(); ctx.stroke();
  wire(ctx, stone, 6);
  ctx.beginPath();
  ctx.moveTo(cx-14+rumble*0.3,cy-2); ctx.lineTo(cx-10,cy-10); ctx.lineTo(cx-3,cy-12);
  ctx.lineTo(cx+5,cy-10); ctx.lineTo(cx+14-rumble*0.3,cy-2);
  ctx.lineTo(cx+12,cy+10); ctx.lineTo(cx-12,cy+10);
  ctx.closePath(); ctx.stroke();
  wire(ctx, crack, 3);
  ctx.beginPath(); ctx.moveTo(cx-3,cy-10); ctx.lineTo(cx-1,cy-2); ctx.lineTo(cx+5,cy+4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+5,cy-8); ctx.lineTo(cx+3,cy-2); ctx.stroke();
  wire(ctx, lava, 5); ctx.globalAlpha=0.65+Math.sin(t*2)*0.2;
  ctx.beginPath(); ctx.moveTo(cx-3,cy-10); ctx.lineTo(cx-1,cy-2); ctx.lineTo(cx+5,cy+4); ctx.stroke();
  ctx.globalAlpha=1;
  wire(ctx, stone, 5);
  ctx.beginPath(); ctx.moveTo(cx-14+rumble,cy); ctx.bezierCurveTo(cx-20,cy+2,cx-23,cy+8,cx-21,cy+12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-21,cy+8); ctx.lineTo(cx-26,cy+10); ctx.lineTo(cx-27,cy+16); ctx.lineTo(cx-21,cy+18); ctx.lineTo(cx-17,cy+14); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+14-rumble,cy); ctx.bezierCurveTo(cx+20,cy+2,cx+23,cy+8,cx+21,cy+12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+21,cy+8); ctx.lineTo(cx+26,cy+10); ctx.lineTo(cx+27,cy+16); ctx.lineTo(cx+21,cy+18); ctx.lineTo(cx+17,cy+14); ctx.closePath(); ctx.stroke();
  wire(ctx, stone, 5);
  ctx.beginPath();
  ctx.moveTo(cx-6,cy-12); ctx.lineTo(cx-8,cy-18); ctx.lineTo(cx-3,cy-22);
  ctx.lineTo(cx+4,cy-22); ctx.lineTo(cx+8,cy-18); ctx.lineTo(cx+6,cy-12);
  ctx.closePath(); ctx.stroke();
  wire(ctx, lava, 8); ctx.globalAlpha=0.8+Math.sin(t*3)*0.15;
  lines(ctx, [[cx-5,cy-18,cx-2,cy-16],[cx+2,cy-18,cx+5,cy-16]]);
  ctx.globalAlpha=1;
  wire(ctx, stone, 3);
  for(let i=0;i<3;i++){
    const a=t*0.9+i*(Math.PI*2/3), r=19+Math.sin(t+i)*2;
    ctx.globalAlpha=0.45+Math.sin(t*1.5+i)*0.3;
    ctx.save(); ctx.translate(cx+Math.cos(a)*r,cy+Math.sin(a)*r*0.45-2); ctx.rotate(a);
    ctx.beginPath(); ctx.rect(-3,-2,6,4); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

export function drawGiantSnail(ctx, cx, cy, t = 0, col) {
  const shell=(col?.shell??'#aa7733'), body=(col?.body??'#88aa44'), eyes=(col?.eyes??'#ffee44');
  const crawl=Math.sin(t*1.2)*1.5;
  wire(ctx, lighten(body,0.05), 3); ctx.globalAlpha=0.25;
  ctx.beginPath(); ctx.moveTo(cx-16,cy+16); ctx.bezierCurveTo(cx-8,cy+18,cx+4,cy+17,cx+14,cy+16); ctx.stroke();
  ctx.globalAlpha=1;
  wire(ctx, body, 6);
  ctx.beginPath(); ctx.ellipse(cx-2,cy+12,16,5,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx+10,cy+8);
  ctx.bezierCurveTo(cx+14,cy+3+crawl*0.5,cx+16,cy-2+crawl,cx+14,cy-6+crawl*0.5);
  ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx+12,cy-8+crawl*0.4,5,4,0.15,0,Math.PI*2); ctx.stroke();
  wire(ctx, body, 3);
  lines(ctx, [[cx+9,cy-10+crawl*0.4,cx+7,cy-17+crawl*0.3],[cx+14,cy-10+crawl*0.4,cx+15,cy-17+crawl*0.5]]);
  wire(ctx, eyes, 10);
  dots(ctx, [[cx+7,cy-17+crawl*0.3],[cx+15,cy-17+crawl*0.5]], 2);
  wire(ctx, shell, 6);
  ctx.beginPath(); ctx.arc(cx-4,cy-1,14,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(shell,0.2), 4);
  ctx.beginPath(); ctx.arc(cx-4,cy-1,9,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(shell,0.35), 3);
  ctx.beginPath(); ctx.arc(cx-4,cy-1,5,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(shell,0.5), 2);
  ctx.beginPath(); ctx.arc(cx-4,cy-1,2,0,Math.PI*2); ctx.stroke();
  wire(ctx, lighten(shell,0.15), 3);
  ctx.beginPath(); ctx.moveTo(cx+10,cy-1); ctx.arc(cx-4,cy-1,14,0,-Math.PI*0.55,true); ctx.stroke();
  wire(ctx, shell, 2);
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a=i*(Math.PI*2/5);
    ctx.moveTo(cx-4+Math.cos(a)*9,cy-1+Math.sin(a)*9); ctx.lineTo(cx-4+Math.cos(a)*14,cy-1+Math.sin(a)*14);
  }
  ctx.stroke();
}

