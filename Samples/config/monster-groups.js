// Monster groups — formation-based encounter definitions.
// spawnMonsters draws groupCount groups per floor from GROUP_POOLS_BY_DEPTH.
//
// members: [ [templateKey, count], ... ]
// formation: 'single' | 'cluster' | 'line' | 'adjacent'

export const MONSTER_GROUPS = {

  // ── Early game (depth 1–3) ────────────────────────────────

  lone_skeleton:  { members: [['skeleton', 1]],                             formation: 'single'   },
  rat_pack:       { members: [['rat', 3]],                                  formation: 'cluster'  },
  bat_swarm:      { members: [['bat', 3]],                                  formation: 'cluster'  },
  mushroom_patch: { members: [['mushroom', 2]],                             formation: 'cluster'  },
  slime_pair:     { members: [['slime', 2]],                                formation: 'adjacent' },
  spider_ambush:  { members: [['spider', 2], ['serpent', 1]],               formation: 'cluster'  },
  zombie_mob:     { members: [['zombie', 2]],                               formation: 'cluster'  },
  skeleton_pair:  { members: [['skeleton', 1], ['skeleton_archer', 1]],     formation: 'adjacent' },

  // ── Mid game (depth 4–6) ──────────────────────────────────

  skeleton_patrol:  { members: [['skeleton', 2], ['skeleton_archer', 1]],   formation: 'line'     },
  orc_warband:      { members: [['orc_warrior', 2], ['orc_mage', 1]],       formation: 'adjacent' },
  wraith_haunt:     { members: [['wraith', 2]],                             formation: 'cluster'  },
  troll_alone:      { members: [['troll', 1]],                              formation: 'single'   },
  undead_patrol:    { members: [['zombie', 2], ['skeleton', 1]],            formation: 'line'     },
  spider_web:       { members: [['spider', 3], ['silkweaver', 1]],          formation: 'cluster'  },
  duskwing_flock:   { members: [['duskwing', 3]],                           formation: 'cluster'  },
  orc_knight_lone:  { members: [['orc_knight', 1]],                         formation: 'single'   },

  // ── Deep game (depth 7+) ──────────────────────────────────

  elite_pair:           { members: [['orc_knight', 1], ['orc_mage', 1]],                           formation: 'adjacent' },
  undead_horde:         { members: [['skeleton', 2], ['zombie', 2], ['skeleton_archer', 1]],        formation: 'cluster'  },
  elemental_duo:        { members: [['fire_elemental', 1], ['air_elemental', 1]],                   formation: 'adjacent' },
  wraith_council:       { members: [['wraith', 2], ['lich', 1]],                                    formation: 'cluster'  },
  gargoyle_perch:       { members: [['gargoyle', 2]],                                               formation: 'adjacent' },
  golem_guard:          { members: [['golem', 1], ['orc_warrior', 2]],                              formation: 'cluster'  },
  plagueborn_cluster:   { members: [['plagueborn', 2]],                                             formation: 'cluster'  },
  crystal_elemental_lone:{ members: [['crystal_elemental', 1]],                                     formation: 'single'   },
};

// ── Depth-gated encounter pools ──────────────────────────────
// First entry where depth <= maxDepth is used.
// Each pool entry: [groupName, weight]

export const GROUP_POOLS_BY_DEPTH = [
  {
    maxDepth: 3,
    pool: [
      ['lone_skeleton',   35],
      ['rat_pack',        25],
      ['bat_swarm',       20],
      ['mushroom_patch',  15],
      ['slime_pair',      15],
      ['spider_ambush',   15],
      ['zombie_mob',      20],
      ['skeleton_pair',   20],
    ],
  },
  {
    maxDepth: 6,
    pool: [
      ['skeleton_patrol',  30],
      ['orc_warband',      25],
      ['wraith_haunt',     20],
      ['troll_alone',      15],
      ['undead_patrol',    20],
      ['spider_web',       15],
      ['duskwing_flock',   12],
      ['orc_knight_lone',  10],
      ['lone_skeleton',    10],
      ['skeleton_pair',    10],
    ],
  },
  {
    maxDepth: Infinity,
    pool: [
      ['elite_pair',           30],
      ['undead_horde',         25],
      ['elemental_duo',        20],
      ['wraith_council',       20],
      ['gargoyle_perch',       15],
      ['golem_guard',          15],
      ['plagueborn_cluster',   12],
      ['crystal_elemental_lone', 10],
      ['skeleton_patrol',      10],
      ['orc_warband',          10],
    ],
  },
];

/** Pick the group pool for a given depth. */
export function groupPoolForDepth(depth) {
  for (const entry of GROUP_POOLS_BY_DEPTH) {
    if (depth <= entry.maxDepth) return entry.pool;
  }
  return GROUP_POOLS_BY_DEPTH[GROUP_POOLS_BY_DEPTH.length - 1].pool;
}
