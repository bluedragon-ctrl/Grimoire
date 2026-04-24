// Typed monster-draw registry.
// Promotes MONSTER_RENDERERS out of the vendor dispatch file to a typed,
// content-facing export. Sprite implementations remain in vendor/ui/render-monsters.js.

type Ctx = CanvasRenderingContext2D;

export type MonsterColors = Record<string, string>;

/** Signature shared by all monster sprite-draw functions. */
export type MonsterDraw = (
  ctx: Ctx,
  cx: number,
  cy: number,
  t: number,
  colors?: MonsterColors,
) => void;

// Vendor JS — TS sees imports as `any`; we assign proper types below.
import {
  drawMage,
  drawSkeleton, drawSlime, drawGhost, drawDragon, drawKnight, drawZombie,
  drawSpider, drawBat, drawWraith, drawGolem, drawOrcWarrior, drawOrcKnight,
  drawOrcMage, drawDarkWizard, drawRat, drawTroll, drawVampire, drawMushroom,
  drawGargoyle, drawLich, drawSerpent, drawWisp, drawSkeletonArcher,
  drawCrystalElemental, drawFireElemental, drawWaterElemental, drawAirElemental,
  drawEarthElemental, drawGiantSnail,
} from "./vendor/ui/render-monsters.js";

export { drawMage };

export const MONSTER_RENDERERS: Record<string, MonsterDraw> = {
  skeleton:          drawSkeleton,
  slime:             drawSlime,
  ghost:             drawGhost,
  dragon:            drawDragon,
  knight:            drawKnight,
  zombie:            drawZombie,
  spider:            drawSpider,
  bat:               drawBat,
  wraith:            drawWraith,
  golem:             drawGolem,
  orc_warrior:       drawOrcWarrior,
  orc_knight:        drawOrcKnight,
  orc_mage:          drawOrcMage,
  dark_wizard:       drawDarkWizard,
  rat:               drawRat,
  troll:             drawTroll,
  vampire:           drawVampire,
  mushroom:          drawMushroom,
  gargoyle:          drawGargoyle,
  lich:              drawLich,
  serpent:           drawSerpent,
  wisp:              drawWisp,
  skeleton_archer:   drawSkeletonArcher,
  crystal_elemental: drawCrystalElemental,
  fire_elemental:    drawFireElemental,
  water_elemental:   drawWaterElemental,
  air_elemental:     drawAirElemental,
  earth_elemental:   drawEarthElemental,
  giant_snail:       drawGiantSnail,
};

/**
 * Draw a monster by type. Falls back to baseVisual if type has no renderer.
 * Throws if neither resolves — caller is responsible for wiring valid keys.
 */
export function drawMonster(
  ctx: Ctx,
  cx: number,
  cy: number,
  type: string,
  t = 0,
  colors?: MonsterColors,
  baseVisual?: string,
): void {
  const renderer =
    MONSTER_RENDERERS[type] ??
    (baseVisual ? MONSTER_RENDERERS[baseVisual] : undefined);
  if (!renderer) {
    throw new Error(
      `drawMonster: no renderer for '${type}'` +
      (baseVisual ? ` or baseVisual '${baseVisual}'` : ""),
    );
  }
  renderer(ctx, cx, cy, t, colors);
}
