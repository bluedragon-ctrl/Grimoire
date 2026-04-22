// Entity drawing — dispatch layer.
// Sprites live in render-monsters.js (incl. the player mage) and render-items.js
// so this file stays a short lookup table + the two front-door dispatch
// functions renderer.js consumes.
// All draw functions take (ctx, cx, cy, ...) — ctx is explicit, never grabbed from a global.

import {
  drawMage,
  drawSkeleton, drawSlime, drawGhost, drawDragon, drawKnight, drawZombie,
  drawSpider, drawBat, drawWraith, drawGolem, drawOrcWarrior, drawOrcKnight,
  drawOrcMage, drawDarkWizard, drawRat, drawTroll, drawVampire, drawMushroom,
  drawGargoyle, drawLich, drawSerpent, drawWisp, drawSkeletonArcher,
  drawCrystalElemental, drawFireElemental, drawWaterElemental, drawAirElemental,
  drawEarthElemental, drawGiantSnail,
} from './render-monsters.js';

import {
  drawChest, drawSword, drawManaCrystal, drawHealthPotion, drawScroll,
  drawGenericItem,
  drawBook, drawKey, drawElixir, drawPotion1, drawPotion2,
  drawWoodenStaff, drawFireStaff, drawIronStaff,
  drawRobeFolded, drawRobeFoldedEmber,
  drawDaggerA, drawDaggerB,
  drawFocusA, drawFocusB,
  drawHat1, drawHat2,
  drawTrap1, drawTrap2, drawTrap3,
} from './render-items.js';

// ── Dispatch Maps ─────────────────────────────────────────

/** Monster type → draw function(ctx, cx, cy, t, colors). */
export const MONSTER_RENDERERS = {
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

/** Item type → draw function(ctx, cx, cy). Prefix matches checked via drawItem. */
export const ITEM_RENDERERS = {
  mana_crystal:  drawManaCrystal,
  health_potion: drawHealthPotion,
  sword:         drawSword,
  // Loot objects
  key:           drawKey,
  potion_1:      drawPotion1,
  potion_2:      drawPotion2,
  // Compound potions (dual-status, mapped explicitly)
  potion_of_fury:    drawElixir,
  potion_of_warding: drawElixir,
  potion_of_focus:   drawElixir,
  // Equipment — staves
  wooden_staff:    drawWoodenStaff,
  fire_staff:      drawFireStaff,
  iron_staff:      drawIronStaff,
  shock_staff:     drawIronStaff,
  draining_staff:  drawFireStaff,
  crystal_staff:   drawIronStaff,
  // Equipment — robes
  leather_robe:    drawRobeFolded,
  silk_robe:       drawRobeFolded,
  ember_robe:      drawRobeFoldedEmber,
  chain_vestment:  drawRobeFolded,
  archmage_robe:   drawRobeFolded,
  shadow_cloak:    drawRobeFoldedEmber,
  // Equipment — daggers
  bone_dagger:     drawDaggerA,
  steel_dagger:    drawDaggerA,
  venom_dagger:    drawDaggerB,
  shadow_blade:    drawDaggerA,
  frost_shard:     drawDaggerB,
  warblade:        drawDaggerA,
  // Equipment — foci
  quartz_focus:    drawFocusB,
  runed_focus:     drawFocusA,
  void_focus:      drawFocusA,
  bloodstone:      drawFocusA,
  star_fragment:   drawFocusB,
  prism_shard:     drawFocusB,
  // Equipment — hats
  cloth_cap:       drawHat1,
  wizard_hat:      drawHat1,
  scholar_circlet: drawHat2,
  iron_helm:       drawHat2,
  arcane_cowl:     drawHat1,
  crown_of_ages:   drawHat2,
  // Floor traps
  trap_1:          drawTrap1,
  trap_2:          drawTrap2,
  trap_3:          drawTrap3,
};

/** Draw a monster by type. If `type` has no renderer, falls back to `baseVisual`
 * (used by boss templates that recolor an existing sprite), then to a skeleton
 * silhouette if that also fails. */
export function drawMonster(ctx, cx, cy, type, t = 0, colors, baseVisual) {
  const renderer = MONSTER_RENDERERS[type]
    || (baseVisual && MONSTER_RENDERERS[baseVisual])
    || drawSkeleton;
  renderer(ctx, cx, cy, t, colors);
}

/** Draw a floor item by type. Falls back to generic circle for unknown types. */
export function drawItem(ctx, cx, cy, type, t = 0, colors) {
  const renderer = ITEM_RENDERERS[type]
    || (type.startsWith('scroll_') ? drawScroll : null)
    || (type.startsWith('book_of_') ? drawBook : null)
    || (type.startsWith('tome_') ? drawBook : null)
    || (type.endsWith('_potion') ? drawHealthPotion : null)
    || (type.endsWith('_elixir') ? drawElixir : null)
    || drawGenericItem;
  renderer(ctx, cx, cy, t, colors);
}

// Re-export sprites so existing importers (sprite-reference, ad-hoc tests)
// keep working without chasing the new module locations.
export {
  drawMage,
  drawSkeleton, drawSlime, drawGhost, drawDragon, drawKnight, drawZombie,
  drawSpider, drawBat, drawWraith, drawGolem, drawOrcWarrior, drawOrcKnight,
  drawOrcMage, drawDarkWizard, drawRat, drawTroll, drawVampire, drawMushroom,
  drawGargoyle, drawLich, drawSerpent, drawWisp, drawSkeletonArcher,
  drawCrystalElemental, drawFireElemental, drawWaterElemental, drawAirElemental,
  drawEarthElemental, drawGiantSnail,
  drawChest, drawSword, drawManaCrystal, drawHealthPotion, drawScroll,
};
