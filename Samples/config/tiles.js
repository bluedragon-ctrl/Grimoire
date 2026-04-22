// Tile definitions — passability, opacity, kind, default colors.
// Variant strings are first-class tile types. Renderers live in ui/render-tiles.js.
//
// Color convention:
//   col1 — boundary / structure (grid, border rect, wall outline)
//   col2 — decorative content   (cracks, moss, pattern, rune, rivets)
//   Floor tile background is always hardcoded black — not a color slot.

export const TILE_DEFS = {
  // ── Floors ───────────────────────────────────────────────
  floor: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#804400' },
  },
  floor_cracked: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#1a1000', col2: '#2a1800' },
  },
  floor_mosaic: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#1a1000', col2: '#443300' },
  },
  floor_dirt: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#1a1000', col2: '#2e1800' },
  },
  floor_mossy: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#804400', col2: '#446633' },
  },
  floor_rune: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#1a1000', col2: '#5522aa' },
  },

  // ── Walls ────────────────────────────────────────────────
  wall: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800' },
  },
  wall_rough: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800' },
  },
  wall_reinforced: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800', col2: '#667788' },
  },
  wall_mossy: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800', col2: '#446633' },
  },
  wall_cyclopean: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800' },
  },
  wall_cave: {
    kind: 'wall', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800' },
  },

  // ── Structures ───────────────────────────────────────────
  stairs_down: {
    kind: 'stairs', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#cc6d00' },
  },
  stairs_up: {
    kind: 'stairs', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#ff8800' },
  },

  // ── Doors ────────────────────────────────────────────────
  door: {
    kind: 'door', blocksMove: true, blocksSight: true,
    defaultColors: { col1: '#ff8800', col2: '#667788' },
  },
  door_open: {
    kind: 'floor', blocksMove: false, blocksSight: false,
    defaultColors: { col1: '#ff8800', col2: '#0a0500' },
  },
};

const DEFAULT_PROPS = { kind: 'floor', blocksMove: false, blocksSight: false, defaultColors: {} };

/** Return { kind, blocksMove, blocksSight, defaultColors } for any tile string. */
export function tileProps(tile) {
  return TILE_DEFS[tile] || DEFAULT_PROPS;
}

/** Shortcut: does this tile block movement? */
export function blocksMove(tile) {
  return tileProps(tile).blocksMove;
}

/** Shortcut: does this tile block line of sight? */
export function blocksSight(tile) {
  return tileProps(tile).blocksSight;
}

/** Shortcut: kind — 'floor' | 'wall' | 'stairs' | 'door'. */
export function tileKind(tile) {
  return tileProps(tile).kind;
}
