// Dungeon object definitions — static config for all placeable dungeon objects.
// Instances (what lives in state.floorObjects) are plain {id, type, x, y, state}.
// Static fields (name, description, blocksMove) live here and are looked up at
// read time — same pattern as ITEM_DEFS in items.js.

export const DUNGEON_OBJECT_DEFS = {
  chest: {
    type: 'chest',
    name: 'chest',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    description: 'A wooden chest. Its contents are unknown.',
    triggers: {
      onInteract: 'grant health_potion\ndespawn',
    },
  },

  stairs_down: {
    type: 'stairs_down',
    name: 'staircase down',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    description: 'A staircase leading deeper into the dungeon.',
    defaultState: {},
    triggers: {
      onInteract: 'descend',
    },
  },

  stairs_up: {
    type: 'stairs_up',
    name: 'staircase up',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    description: 'A staircase leading back up.',
    defaultState: {},
    triggers: {
      onInteract: 'ascend',
    },
  },

  door: {
    type: 'door',
    name: 'door',
    blocksMove: true,
    blocksSight: true,
    hp: null,
    stopAdjacent: true,
    description: 'A wooden door.',
    defaultState: { open: false },
    triggers: {
      onInteract: 'if self.state.open; then close; else open; fi',
    },
  },

  fountain_health: {
    type: 'fountain_health',
    name: 'fountain of healing',
    blocksMove: true,
    blocksSight: false,
    hp: null,
    stopAdjacent: true,
    description: 'Clear water shimmers with restorative energy.',
    defaultState: {},
    triggers: {
      onInteract: 'restore hp 20',
    },
  },

  fountain_mana: {
    type: 'fountain_mana',
    name: 'fountain of mana',
    blocksMove: true,
    blocksSight: false,
    hp: null,
    stopAdjacent: true,
    description: 'The water glows faintly blue.',
    defaultState: {},
    triggers: {
      onInteract: 'restore mp 20',
    },
  },

  // ── Traps ─────────────────────────────────────────────────
  // Faction-neutral — fire on any entity that steps onto them.
  // Persistent by default; one-shot traps end their script with `despawn`.

  trap_spike: {
    type: 'trap_spike',
    name: 'spike trap',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A pressure plate bristling with steel spikes.',
    defaultState: {},
    colors: { col1: '#554433', col2: '#aaaaaa' },
    triggers: {
      onStep: 'project $interactor damage=15 element=physical',
    },
  },

  trap_poison_spike: {
    type: 'trap_poison_spike',
    name: 'poison spike trap',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'Spikes coated in a virulent green toxin.',
    defaultState: {},
    colors: { col1: '#334422', col2: '#55aa22' },
    triggers: {
      onStep: 'project $interactor damage=8 element=physical\ninflict status=poison duration=5 power=3 target=$interactor',
    },
  },

  trap_bear_trap: {
    type: 'trap_bear_trap',
    name: 'bear trap',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A rusted iron trap that snaps shut on contact. One-shot.',
    defaultState: {},
    colors: { col1: '#553322', col2: '#776655' },
    triggers: {
      onStep: 'project $interactor damage=5 element=physical\ninflict status=slow duration=4 target=$interactor\ndespawn',
    },
  },

  trap_fire: {
    type: 'trap_fire',
    name: 'fire trap',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A grate concealing a pressurised fire burst.',
    defaultState: {},
    colors: { col1: '#443322', col2: '#ff6600' },
    triggers: {
      onStep: 'explode $interactor damage=20 element=fire radius=1',
    },
  },

  trap_cold: {
    type: 'trap_cold',
    name: 'frost trap',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'An icy grate that vents a freezing blast.',
    defaultState: {},
    colors: { col1: '#334455', col2: '#88ccff' },
    triggers: {
      onStep: 'explode $interactor damage=12 element=frost radius=1\ninflict status=slow duration=3 target=$interactor',
    },
  },

  trap_steam: {
    type: 'trap_steam',
    name: 'steam vent',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A scalding steam vent that leaves victims exposed.',
    defaultState: {},
    colors: { col1: '#556655', col2: '#cccccc' },
    triggers: {
      // `blind` status not yet implemented — `expose` (DEF debuff) substituted.
      onStep: 'project $interactor damage=5 element=fire\ninflict status=expose duration=3 target=$interactor',
    },
  },

  trap_lightning: {
    type: 'trap_lightning',
    name: 'lightning rune',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'An inscribed rune that discharges a lightning jolt.',
    defaultState: {},
    colors: { col1: '#221144', col2: '#ffff44' },
    triggers: {
      onStep: 'project $interactor damage=18 element=lightning',
    },
  },

  trap_teleport: {
    type: 'trap_teleport',
    name: 'teleport rune',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A displacement rune. One-shot — the magic exhausts itself.',
    defaultState: {},
    colors: { col1: '#332244', col2: '#cc44ff' },
    triggers: {
      onStep: 'teleport $interactor random=true range=15\ndespawn',
    },
  },

  trap_mana_burn: {
    type: 'trap_mana_burn',
    name: 'mana siphon',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'An arcane rune that drains magical reserves.',
    defaultState: {},
    colors: { col1: '#223344', col2: '#44aaff' },
    triggers: {
      onStep: 'inflict status=mana_burn duration=5 power=3 target=$interactor',
    },
  },

  trap_weaken: {
    type: 'trap_weaken',
    name: 'weakening rune',
    blocksMove: false,
    blocksSight: false,
    hp: null,
    hidden: true,
    description: 'A cursed rune that saps physical strength.',
    defaultState: {},
    colors: { col1: '#334433', col2: '#aa4422' },
    triggers: {
      onStep: 'inflict status=weaken duration=5 power=3 target=$interactor',
    },
  },

  // ── Special dungeon furniture ────────────────────────────
  // Placed via the special-object pool (0–1 per floor, non-spawn rooms).

  shrine: {
    type: 'shrine',
    name: 'shrine',
    blocksMove: true,
    blocksSight: false,
    hp: null,
    stopAdjacent: true,
    description: 'A weathered stone shrine radiating faint holy light.',
    defaultState: { used: false },
    triggers: {
      onInteract: 'if self.state.used; then echo The shrine is spent.; else restore hp 15\nrestore mp 15\nset self.state.used true; fi',
    },
  },

  altar: {
    type: 'altar',
    name: 'altar',
    blocksMove: true,
    blocksSight: false,
    hp: null,
    stopAdjacent: true,
    description: 'A dark altar humming with arcane power.',
    defaultState: { used: false },
    triggers: {
      onInteract: 'if self.state.used; then echo The altar is inert.; else inflict status=arcane_ward duration=30 target=player\nset self.state.used true; fi',
    },
  },

  throne: {
    type: 'throne',
    name: 'throne',
    blocksMove: true,
    blocksSight: false,
    hp: null,
    stopAdjacent: true,
    description: 'A crumbling stone throne. Whoever sat here is long gone.',
    defaultState: {},
    triggers: {
      onInteract: 'echo The throne is cold and silent.',
    },
  },
};

export function objectName(obj) {
  return DUNGEON_OBJECT_DEFS[obj.type]?.name ?? obj.type;
}

// ── Special object pools ──────────────────────────────────────
// Weighted pool of special dungeon furniture types.
// 'none' = no special object placed this floor.

export const OBJECT_POOLS = {
  common: [
    ['shrine',  20],
    ['altar',   12],
    ['throne',   5],
    ['none',    63],
  ],
};

export const OBJECT_POOL_BY_DEPTH = [
  { maxDepth: Infinity, pool: 'common' },
];

/**
 * Roll whether a special object spawns this floor and which type.
 * Returns the object type string, or null if none should spawn.
 * @param {number} depth
 * @param {() => number} rng
 */
export function rollSpecialObject(depth, rng) {
  let poolName = OBJECT_POOLS.common; // fallback
  for (const entry of OBJECT_POOL_BY_DEPTH) {
    if (depth <= entry.maxDepth) { poolName = entry.pool; break; }
  }
  const pool = OBJECT_POOLS[poolName];
  if (!pool) return null;
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [type, weight] of pool) {
    r -= weight;
    if (r <= 0) return type === 'none' ? null : type;
  }
  return null;
}
