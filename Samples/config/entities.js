// Entity stat templates — shared structure for player and all monsters.
// Each entity instance gets a shallow copy of these defaults.
//
// Required fields:
//   type        unique template key; also used by the renderer lookup.
//   faction     'player' | 'monster' | 'undead' (or custom). Drives the
//               FACTION_RELATIONS table and the `enemies`/`allies`/`others`
//               selectors. Unknown pairs default to hostile.
//   hp/maxHp, mp/maxMp, atk, def, spd, rng, int, level, fovRadius.
//   resistances per-damage-type map (e.g. { fire: 99, poison: 5 }). Cloned
//               per-instance because shield/ward statuses mutate these.
//
// Optional fields:
//   name        display name override; defaults to a prettified `type`.
//   script      DSL AI script run each activation (monsters only).
//   deathColor  primary color for the deathBurst effect on kill. Defaults to
//               a neutral gold (#ffcc66) if omitted.
//   startingInventory
//               array of ITEM_DEFS keys granted to the monster at spawn.
//               Realized into full item instances so `use`/`drop`/`pickup`
//               work interchangeably with player inventory. AI scripts can
//               read `inventory[type=...]` and `use` items.
//
// Reaction hooks (all permission-locked — bypass the player's knownCommands
// gate — and do NOT consume the entity's action budget):
//   onDamaged   runs after the entity takes damage, with `self` = victim.
//               Receives context for the attacker. Common pattern: combine
//               with `self.memory.<flag>` for once-per-fight phase shifts.
//   onTurnStart runs at the start of each activation, before `script`.
//               Used for self-buff refresh or idle behavior.
//   onKill      runs when the entity lands a killing blow, with `self` =
//               the killer. Used for feeding/regen themes.
//   onDeath     runs when the entity dies, with `self` = the dying entity.
//               Used for exploder/summoner/boss-drop behavior.
//
//   memory      per-instance KV store. Written via `set self.memory.<k> <v>`,
//               read via `self.memory.<k>`. Persists across turns until the
//               entity is removed. Used to gate once-per-fight effects.
//   lastAttacker
//               auto-populated with the ID of whoever most recently damaged
//               the entity. Useful for retaliation scripts and onDamaged.
//
//   ownerId     set on summoned instances to the summoner's ID. Natural
//               spawns leave it null. Death of the owner cascades to owned
//               summons via the summoning system.
//   duration    turns remaining for summoned instances (null = permanent).
//               Decremented each turn; entity despawns when it hits 0.
//
//   boss        if true, the monster is treated as a unique/boss tier entity.
//               Excluded from the default random spawn pool in spawning.js —
//               future dungeon-gen features will place bosses explicitly
//               (boss rooms, depth gates, once-per-run guarantees).
//   baseVisual  if set, the renderer uses MONSTER_RENDERERS[baseVisual] when
//               no drawer is registered for `type`. Lets bosses reuse existing
//               sprites with a distinct type/name/color palette, so a recolor
//               doesn't require a new draw function.

export const PLAYER_TEMPLATE = {
  type: 'mage',
  faction: 'player',
  // Summoning lifecycle — natural entities have no owner and no expiry.
  // Summoned instances override these at spawn time (see spawning.js +
  // the `summon` DSL command).
  ownerId: null,
  duration: null,
  colors: { body: '#aa66ff', face: '#cc99ff', staff: '#aa66ff', magic: '#aa66ff', dagger: '#aaccee', focus: '#66ddff' },
  hp: 30,
  maxHp: 30,
  mp: 20,
  maxMp: 20,
  atk: 5,
  def: 3,
  spd: 10,
  rng: 1,
  int: 5,
  level: 1,
  fovRadius: 8,
  // Magic schools — sub-stat per school that scales spell primitives tagged
  // with that element. 0 = untrained (50% damage), 1 = baseline (100%), each
  // further level adds +50%. Arcane starts at 1 as the neutral baseline;
  // other schools unlock via tomes. See PRIMITIVES.md.
  schools: { fire: 0, frost: 0, lightning: 0, arcane: 1, poison: 0 },
  resistances: {},
  // Equipment aggregate — monotone-max bonuses written by the `merge` DSL
  // verb (typically invoked from equipment item scripts). Keys are stat
  // names; values stack additively onto the base stat via
  // effectiveStat() in engine reads. Not an inventory list — equipment
  // items live in `inventory` and are consumed by `use` like any other
  // script item; only their merge side-effect persists here.
  equipment: {},
  lastAttacker: null,
};

// Shared AI scripts — authored once, referenced by multiple templates.
// Scripts read like player commands: selectors, pipes, and control flow.
// `self.*` inside a script refers to the activating monster.
//
// Faction-aware targeting: scripts use the `enemies` selector (resolves to
// visible hostile entities from the executor's POV via the FACTION_RELATIONS
// table). Because `enemies` can return an empty array when no hostiles are
// visible, every stage guards with `if enemies; then ...; fi` to avoid
// piping empty arrays into `sort-by | first`. The four templates that still
// hard-target `player` (vampire, dark_wizard, the_hollow_king, nightmare)
// do NOT use these helpers — their scripts are inlined on the template.

// Pursuit tail — appended to smart-monster scripts after the approach branch.
const _PURSUIT = `else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi`;

// Mindless melee — no memory, forgets target the moment it leaves sight.
const AI_MELEE = `if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi`;

// Intelligent melee — remembers last-seen position and pursues.
const AI_MELEE_PURSUIT = `if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
${_PURSUIT}
fi; fi; fi`;

// Fast glass cannon — bite and retreat when hurt. Mindless, no pursuit.
const AI_SKIRMISH = `if self.hp < self.maxHp / 3 && enemies; then
  enemies | sort-by range | first | flee
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi`;

// Fast glass cannon with pursuit — for animals that hunt by instinct.
const AI_SKIRMISH_PURSUIT = `if self.hp < self.maxHp / 3 && enemies; then
  enemies | sort-by range | first | flee
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
${_PURSUIT}
fi; fi; fi; fi`;

// Generic caster — cast named spell if in range and affordable, else close to melee.
function casterScript(spell, castRange, mpCost, fallbackRange = 1) {
  return `if enemies[range<=${castRange}] && self.mp >= ${mpCost}; then
  enemies | sort-by range | first | cast ${spell}
else if enemies[range<=${fallbackRange}]; then
  attack enemies[range<=${fallbackRange}]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi`;
}

// Caster with pursuit — remembers last-seen position.
function casterScriptPursuit(spell, castRange, mpCost, fallbackRange = 1) {
  return `if enemies[range<=${castRange}] && self.mp >= ${mpCost}; then
  enemies | sort-by range | first | cast ${spell}
else if enemies[range<=${fallbackRange}]; then
  attack enemies[range<=${fallbackRange}]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
${_PURSUIT}
fi; fi; fi; fi`;
}

// Hybrid caster — prefers spell at range, melees when adjacent, flees when low HP.
function hybridScript(spell, castRange, mpCost) {
  return `if self.hp < self.maxHp / 4 && enemies; then
  enemies | sort-by range | first | flee
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies[range<=${castRange}] && self.mp >= ${mpCost}; then
  enemies | sort-by range | first | cast ${spell}
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi; fi`;
}

// Hybrid caster with pursuit.
function hybridScriptPursuit(spell, castRange, mpCost) {
  return `if self.hp < self.maxHp / 4 && enemies; then
  enemies | sort-by range | first | flee
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies[range<=${castRange}] && self.mp >= ${mpCost}; then
  enemies | sort-by range | first | cast ${spell}
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
${_PURSUIT}
fi; fi; fi; fi; fi`;
}

export const MONSTER_TEMPLATES = {
  // ── Weak tier ─────────────────────────────────────────────
  rat: {
    type: 'rat',
    faction: 'monster',
    dropTable: 'monster_rat',
    colors: { body: '#887766', tail: '#665544', eyes: '#ff2200' },
    deathColor: '#aa6644',
    hp: 5, maxHp: 5, mp: 0, maxMp: 0,
    atk: 3, def: 0, spd: 12, rng: 1, int: 1,
    level: 1, fovRadius: 6,
    resistances: {},
    statScaling: { maxHp: 1 },
    script: AI_SKIRMISH_PURSUIT,
  },
  mushroom: {
    type: 'mushroom',
    faction: 'monster',
    dropTable: 'monster_mushroom',
    colors: { cap: '#cc4422', stalk: '#ddcc99', spores: '#ffeeaa' },
    deathColor: '#cc4422',
    hp: 6, maxHp: 6, mp: 0, maxMp: 0,
    atk: 2, def: 1, spd: 4, rng: 1, int: 1,
    level: 1, fovRadius: 4,
    resistances: { poison: 10 },
    statScaling: { maxHp: 1 },
    // Puffs a poison cloud when stomped. `self` is the dying mushroom.
    onDeath: 'cast poison_cloud at self',
    script: AI_MELEE,
  },
  bat: {
    type: 'bat',
    faction: 'monster',
    dropTable: 'monster_bat',
    colors: { body: '#553366', wings: '#442255', eyes: '#ff4466' },
    deathColor: '#553366',
    hp: 8, maxHp: 8, mp: 0, maxMp: 0,
    atk: 4, def: 0, spd: 13, rng: 1, int: 1,
    level: 1, fovRadius: 7,
    resistances: {},
    statScaling: { maxHp: 1 },
    script: AI_SKIRMISH_PURSUIT,
  },

  // ── Standard tier ────────────────────────────────────────
  skeleton: {
    type: 'skeleton',
    faction: 'undead',
    dropTable: 'monster_skeleton',
    colors: { skull: '#ccbb99', torso: '#ccbb99', limbs: '#ccbb99' },
    deathColor: '#ccbb99',
    hp: 12, maxHp: 12, mp: 0, maxMp: 0,
    atk: 6, def: 2, spd: 8, rng: 1, int: 1,
    level: 1, fovRadius: 6,
    resistances: { poison: 5 },
    statScaling: { maxHp: 2, def: 1 },
    script: AI_MELEE_PURSUIT,
  },
  slime: {
    type: 'slime',
    faction: 'monster',
    dropTable: 'monster_slime',
    colors: { body: '#44dd44', eyes: '#88ff66', drip: '#44dd44' },
    deathColor: '#44dd44',
    hp: 16, maxHp: 16, mp: 0, maxMp: 0,
    atk: 4, def: 3, spd: 6, rng: 1, int: 1,
    level: 1, fovRadius: 5,
    resistances: { poison: 3, physical: 2 },
    statScaling: { maxHp: 2, def: 1 },
    script: AI_MELEE,
  },
  spider: {
    type: 'spider',
    faction: 'monster',
    dropTable: 'monster_spider',
    colors: { body: '#222244', legs: '#334455', eyes: '#ff2200' },
    deathColor: '#222244',
    hp: 10, maxHp: 10, mp: 8, maxMp: 8,
    atk: 5, def: 1, spd: 10, rng: 1, int: 2,
    level: 2, fovRadius: 6,
    resistances: { poison: 5 },
    statScaling: { maxHp: 1, maxMp: 2, int: 1 },
    script: casterScriptPursuit('venom_bolt', 4, 5),
  },
  serpent: {
    type: 'serpent',
    faction: 'monster',
    dropTable: 'monster_serpent',
    colors: { scales: '#227744', hood: '#33aa55', eyes: '#ffee00' },
    deathColor: '#227744',
    hp: 18, maxHp: 18, mp: 8, maxMp: 8,
    atk: 7, def: 2, spd: 10, rng: 1, int: 2,
    level: 2, fovRadius: 6,
    resistances: { poison: 5 },
    statScaling: { maxHp: 2, maxMp: 2, int: 1 },
    script: casterScriptPursuit('venom_bolt', 4, 5),
  },
  zombie: {
    type: 'zombie',
    faction: 'undead',
    dropTable: 'monster_zombie',
    colors: { flesh: '#88aa66', rot: '#445533', rags: '#556644' },
    deathColor: '#445533',
    hp: 22, maxHp: 22, mp: 0, maxMp: 0,
    atk: 7, def: 2, spd: 5, rng: 1, int: 1,
    level: 2, fovRadius: 5,
    resistances: { poison: 8 },
    statScaling: { maxHp: 3, def: 1 },
    script: AI_MELEE,
  },
  skeleton_archer: {
    type: 'skeleton_archer',
    faction: 'undead',
    dropTable: 'monster_skeleton_archer',
    colors: { skull: '#ccbb99', limbs: '#ccbb99', bow: '#aa8833' },
    deathColor: '#ccbb99',
    hp: 12, maxHp: 12, mp: 0, maxMp: 0,
    atk: 5, def: 1, spd: 9, rng: 3, int: 2,
    level: 2, fovRadius: 7,
    resistances: { poison: 5 },
    statScaling: { maxHp: 2, def: 1 },
    script: `if enemies[range<=1]; then
  enemies | sort-by range | first | flee
else if enemies[range<=5]; then
  enemies | sort-by range | first | cast arrow_shot
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi`,
  },
  ghost: {
    type: 'ghost',
    faction: 'undead',
    dropTable: 'monster_ghost',
    colors: { shroud: '#8899cc', eyes: '#bbccee', wisp: '#667799' },
    deathColor: '#8899cc',
    hp: 14, maxHp: 14, mp: 10, maxMp: 10,
    atk: 6, def: 1, spd: 9, rng: 1, int: 3,
    level: 2, fovRadius: 7,
    resistances: { physical: 3 },
    statScaling: { maxHp: 1, maxMp: 2, int: 1 },
    script: casterScriptPursuit('magic_missile', 5, 3),
  },
  wisp: {
    type: 'wisp',
    faction: 'monster',
    dropTable: 'monster_wisp',
    colors: { core: '#aaddff', halo: '#5588bb', sparks: '#eeffff' },
    deathColor: '#aaddff',
    hp: 10, maxHp: 10, mp: 15, maxMp: 15,
    atk: 3, def: 1, spd: 11, rng: 3, int: 5,
    level: 3, fovRadius: 8,
    resistances: { lightning: 99, physical: 2 },
    statScaling: { maxHp: 1, maxMp: 2, int: 1 },
    script: hybridScriptPursuit('lightning_bolt', 5, 6),
  },

  // ── Strong tier ──────────────────────────────────────────
  wraith: {
    type: 'wraith',
    faction: 'undead',
    dropTable: 'monster_wraith',
    colors: { form: '#334466', tendrils: '#223355', core: '#6688ff' },
    deathColor: '#334466',
    hp: 18, maxHp: 18, mp: 12, maxMp: 12,
    atk: 7, def: 3, spd: 8, rng: 1, int: 4,
    level: 3, fovRadius: 7,
    resistances: { physical: 4, arcane: 3 },
    statScaling: { maxHp: 2, maxMp: 2, int: 1 },
    script: hybridScriptPursuit('drain_life', 4, 6),
  },
  giant_snail: {
    type: 'giant_snail',
    faction: 'monster',
    dropTable: 'monster_giant_snail',
    colors: { shell: '#aa7733', body: '#88aa44', eyes: '#ffee44' },
    deathColor: '#aa7733',
    hp: 30, maxHp: 30, mp: 0, maxMp: 0,
    atk: 4, def: 8, spd: 3, rng: 1, int: 1,
    level: 3, fovRadius: 4,
    resistances: { physical: 4 },
    statScaling: { maxHp: 3, def: 2 },
    script: AI_MELEE,
  },
  gargoyle: {
    type: 'gargoyle',
    faction: 'undead',
    dropTable: 'monster_gargoyle',
    colors: { stone: '#778899', wings: '#556677', eyes: '#ff4400' },
    deathColor: '#778899',
    hp: 26, maxHp: 26, mp: 0, maxMp: 0,
    atk: 8, def: 5, spd: 7, rng: 1, int: 1,
    level: 3, fovRadius: 6,
    resistances: { physical: 5 },
    statScaling: { maxHp: 3, def: 2 },
    script: AI_MELEE_PURSUIT,
  },
  troll: {
    type: 'troll',
    faction: 'monster',
    dropTable: 'monster_troll',
    colors: { hide: '#557755', eyes: '#ffcc00', face: '#446644' },
    deathColor: '#557755',
    hp: 32, maxHp: 32, mp: 0, maxMp: 0,
    atk: 9, def: 2, spd: 6, rng: 1, int: 1,
    level: 4, fovRadius: 6,
    resistances: {},
    statScaling: { maxHp: 4 },
    startingInventory: ['health_potion'],
    // Once-per-fight enrage at half HP. Demonstrates onDamaged + memory:
    // the memory flag keeps the buff from re-firing on every subsequent hit.
    onDamaged: `if self.hp < self.maxHp / 2 && !self.memory.enraged; then
  set self.memory.enraged 1
  modify atk 4
fi`,
    // Emergency self-heal: if HP drops below 1/3 and a potion is in inventory,
    // the troll drinks it instead of attacking. Demonstrates monster inventory
    // use — same `use` command as the player, same script semantics.
    script: `if self.hp < self.maxHp / 3 && inventory[type=health_potion]; then
  use health_potion
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
fi; fi; fi; fi`,
  },
  knight: {
    type: 'knight',
    faction: 'monster',
    dropTable: 'monster_knight',
    colors: { helmet: '#aabbcc', plate: '#aabbcc', limbs: '#aabbcc' },
    deathColor: '#aabbcc',
    hp: 24, maxHp: 24, mp: 0, maxMp: 0,
    atk: 8, def: 5, spd: 8, rng: 1, int: 2,
    level: 3, fovRadius: 7,
    resistances: { physical: 3 },
    statScaling: { maxHp: 3, def: 2 },
    startingInventory: ['shield_potion'],
    // Drinks a shield potion when hurt for the first time, before engaging.
    script: `if self.hp < self.maxHp && inventory[type=shield_potion]; then
  use shield_potion
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
fi; fi; fi; fi`,
  },
  orc_warrior: {
    type: 'orc_warrior',
    faction: 'monster',
    dropTable: 'monster_orc_warrior',
    colors: { skin: '#44aa55', armor: '#887766', weapon: '#aabbcc' },
    deathColor: '#44aa55',
    hp: 20, maxHp: 20, mp: 0, maxMp: 0,
    atk: 7, def: 3, spd: 8, rng: 1, int: 1,
    level: 3, fovRadius: 6,
    resistances: {},
    statScaling: { maxHp: 2, def: 1 },
    script: AI_MELEE_PURSUIT,
  },
  orc_knight: {
    type: 'orc_knight',
    faction: 'monster',
    dropTable: 'monster_orc_knight',
    colors: { skin: '#44aa55', plate: '#bbccdd', shield: '#aa3322' },
    deathColor: '#44aa55',
    hp: 28, maxHp: 28, mp: 0, maxMp: 0,
    atk: 9, def: 5, spd: 7, rng: 1, int: 2,
    level: 4, fovRadius: 6,
    resistances: { physical: 3 },
    statScaling: { maxHp: 3, def: 2 },
    startingInventory: ['health_potion'],
    script: `if self.hp < self.maxHp / 2 && inventory[type=health_potion]; then
  use health_potion
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
fi; fi; fi; fi`,
  },
  orc_patrol: {
    type: 'orc_patrol',
    baseVisual: 'orc_warrior',
    faction: 'monster',
    dropTable: 'monster_orc_patrol',
    name: 'Orc Patrol',
    colors: { skin: '#336644', armor: '#554433', weapon: '#887755' },
    deathColor: '#336644',
    hp: 18, maxHp: 18, mp: 0, maxMp: 0,
    atk: 6, def: 2, spd: 7, rng: 1, int: 1,
    level: 2, fovRadius: 5,
    resistances: {},
    statScaling: { maxHp: 2 },
    script: `if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
else
  if not self.memory.wp; then rooms | sort-by range | last | remember wp; fi
  approach self.memory.wp
  if inside self.memory.wp; then set self.memory.wp none; fi
fi; fi; fi; fi`,
  },
  orc_mage: {
    type: 'orc_mage',
    faction: 'monster',
    dropTable: 'monster_orc_mage',
    colors: { skin: '#44aa55', robe: '#335522', magic: '#aaff66' },
    deathColor: '#335522',
    hp: 18, maxHp: 18, mp: 12, maxMp: 12,
    atk: 5, def: 2, spd: 8, rng: 2, int: 4,
    level: 3, fovRadius: 7,
    resistances: { poison: 3 },
    statScaling: { maxHp: 2, maxMp: 2, int: 1 },
    script: casterScriptPursuit('venom_bolt', 4, 5),
  },
  dark_wizard: {
    type: 'dark_wizard',
    faction: 'monster',
    dropTable: 'monster_dark_wizard',
    colors: { robe: '#220033', staff: '#aa6633', magic: '#ff22ff' },
    deathColor: '#220033',
    hp: 16, maxHp: 16, mp: 16, maxMp: 16,
    atk: 5, def: 2, spd: 9, rng: 3, int: 5,
    level: 4, fovRadius: 7,
    resistances: { arcane: 3 },
    statScaling: { maxHp: 1, maxMp: 3, int: 1 },
    // Opt-in player hunter — arcane rival, obsessively targets the mage
    // even when other hostiles are present. Inlined (not via casterScript)
    // so it stays on `player` after the faction migration.
    script: `if player[range<=5] && self.mp >= 4; then
  cast firebolt at player
else if player[range<=1]; then
  attack player
else
  approach player
fi; fi`,
  },
  vampire: {
    type: 'vampire',
    faction: 'undead',
    dropTable: 'monster_vampire',
    colors: { cape: '#220011', face: '#ddeeff', eyes: '#ff0033' },
    deathColor: '#220011',
    hp: 28, maxHp: 28, mp: 14, maxMp: 14,
    atk: 9, def: 3, spd: 10, rng: 1, int: 4,
    level: 5, fovRadius: 8,
    resistances: { physical: 2, arcane: 2 },
    statScaling: { maxHp: 3, maxMp: 2, int: 1 },
    // Opt-in player hunter — feeds specifically on the mage, ignores other
    // targets even though faction table says it's hostile to naturals.
    // Inlined (not via hybridScript) so it stays on `player` after migration.
    script: `if self.hp < self.maxHp / 4; then
  flee player
else if player[range<=1]; then
  attack player
else if player[range<=4] && self.mp >= 6; then
  cast drain_life at player
else
  approach player
fi; fi; fi`,
  },

  // ── Elite tier ───────────────────────────────────────────
  lich: {
    type: 'lich',
    faction: 'undead',
    dropTable: 'monster_lich',
    colors: { robe: '#1a0033', skull: '#ccddaa', staff: '#8833ff' },
    deathColor: '#1a0033',
    hp: 32, maxHp: 32, mp: 20, maxMp: 20,
    atk: 7, def: 3, spd: 8, rng: 4, int: 6,
    level: 5, fovRadius: 8,
    resistances: { poison: 10, arcane: 4, physical: 2 },
    statScaling: { maxHp: 3, maxMp: 3, int: 1 },
    startingInventory: ['mana_crystal'],
    // Drinks a mana crystal when reserves run dry, keeping the nova threat alive.
    script: `if self.mp < 10 && inventory[type=mana_crystal]; then
  use mana_crystal
else if self.hp < self.maxHp / 3 && self.mp >= 6 && enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | cast drain_life
else if enemies[range<=5] && self.mp >= 10; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | cast arcane_nova
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
fi; fi; fi; fi; fi; fi`,
  },
  golem: {
    type: 'golem',
    faction: 'monster',
    dropTable: 'monster_golem',
    colors: { stone: '#667788', eyes: '#88ffcc', bolt: '#44aaff' },
    deathColor: '#667788',
    hp: 40, maxHp: 40, mp: 0, maxMp: 0,
    atk: 9, def: 7, spd: 5, rng: 1, int: 1,
    level: 5, fovRadius: 6,
    resistances: { physical: 6, poison: 5 },
    statScaling: { maxHp: 4, def: 2 },
    script: AI_MELEE_PURSUIT,
  },
  dragon: {
    type: 'dragon',
    faction: 'monster',
    dropTable: 'monster_dragon',
    colors: { head: '#ff4422', body: '#ff4422', wings: '#ff8855' },
    deathColor: '#ff4422',
    hp: 45, maxHp: 45, mp: 18, maxMp: 18,
    atk: 12, def: 4, spd: 9, rng: 2, int: 5,
    level: 6, fovRadius: 8,
    resistances: { fire: 99 },
    statScaling: { maxHp: 4, maxMp: 2, int: 1 },
    startingInventory: ['fire_ward_potion'],
    // Drinks its ward before the first breath — stacks fire resistance when
    // a target comes into view.
    script: `if enemies && inventory[type=fire_ward_potion] && !self.memory.warded; then
  set self.memory.warded 1
  use fire_ward_potion
else if enemies[range<=5] && self.mp >= 8; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | cast fireball
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | remember target
  enemies | sort-by range | first | approach
else if self.memory.target; then
  approach self.memory.target
  if inside self.memory.target; then set self.memory.target none; fi
fi; fi; fi; fi; fi`,
  },

  // ── Elementals ───────────────────────────────────────────
  fire_elemental: {
    type: 'fire_elemental',
    faction: 'monster',
    dropTable: 'monster_fire_elemental',
    colors: { flame: '#ff4400', ember: '#ff8800', core: '#ffdd00' },
    deathColor: '#ff4400',
    hp: 22, maxHp: 22, mp: 14, maxMp: 14,
    atk: 7, def: 2, spd: 9, rng: 2, int: 4,
    level: 4, fovRadius: 7,
    resistances: { fire: 99, frost: -3 },
    statScaling: { maxHp: 2, maxMp: 2, int: 1 },
    script: casterScriptPursuit('firebolt', 5, 4),
  },
  water_elemental: {
    type: 'water_elemental',
    faction: 'monster',
    dropTable: 'monster_water_elemental',
    colors: { water: '#2255aa', foam: '#66aadd', core: '#aaddff' },
    deathColor: '#2255aa',
    hp: 24, maxHp: 24, mp: 14, maxMp: 14,
    atk: 6, def: 3, spd: 8, rng: 2, int: 4,
    level: 4, fovRadius: 7,
    resistances: { frost: 99, fire: -3 },
    statScaling: { maxHp: 2, def: 1, maxMp: 2, int: 1 },
    script: casterScriptPursuit('frostbolt', 4, 5),
  },
  air_elemental: {
    type: 'air_elemental',
    faction: 'monster',
    dropTable: 'monster_air_elemental',
    colors: { wind: '#aaccee', mist: '#ddeeff', core: '#ffffff' },
    deathColor: '#aaccee',
    hp: 18, maxHp: 18, mp: 14, maxMp: 14,
    atk: 6, def: 2, spd: 12, rng: 2, int: 4,
    level: 4, fovRadius: 8,
    resistances: { lightning: 99, physical: 3 },
    statScaling: { maxHp: 2, maxMp: 2, int: 1 },
    script: casterScriptPursuit('lightning_bolt', 5, 6),
  },
  earth_elemental: {
    type: 'earth_elemental',
    faction: 'monster',
    dropTable: 'monster_earth_elemental',
    colors: { stone: '#887755', crack: '#553322', lava: '#ff8833' },
    deathColor: '#887755',
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    atk: 8, def: 5, spd: 6, rng: 2, int: 3,
    level: 4, fovRadius: 6,
    resistances: { physical: 4, lightning: -3 },
    statScaling: { maxHp: 3, def: 1, maxMp: 1, int: 1 },
    script: casterScriptPursuit('rock_throw', 4, 4),
  },
  crystal_elemental: {
    type: 'crystal_elemental',
    faction: 'monster',
    dropTable: 'monster_crystal_elemental',
    colors: { crystal: '#88ccff', core: '#eeffff', edge: '#4488bb' },
    deathColor: '#88ccff',
    hp: 22, maxHp: 22, mp: 16, maxMp: 16,
    atk: 6, def: 3, spd: 8, rng: 3, int: 5,
    level: 4, fovRadius: 7,
    resistances: { arcane: 5, physical: 3 },
    statScaling: { maxHp: 2, def: 1, maxMp: 2, int: 1 },
    script: casterScriptPursuit('arcane_beam', 5, 7),
  },

  // ══════════════════════════════════════════════════════════
  // BOSSES — unique, depth-gated. Excluded from random spawns.
  // Each reuses an existing renderer via `baseVisual`.
  // ══════════════════════════════════════════════════════════

  bonelord_morrak: {
    type: 'bonelord_morrak',
    faction: 'undead',
    baseVisual: 'skeleton',
    boss: true,
    dropTable: null,
    name: 'Bonelord Morrak',
    colors: { skull: '#ffcc44', torso: '#221122', limbs: '#221122' },
    deathColor: '#ffcc44',
    hp: 80, maxHp: 80, mp: 24, maxMp: 24,
    atk: 13, def: 5, spd: 9, rng: 4, int: 6,
    level: 6, fovRadius: 9,
    resistances: { poison: 99, arcane: 4 },
    script: `if enemies[range<=5] && self.mp >= 10; then
  enemies | sort-by range | first | cast arcane_nova
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi`,
    // Phase 2: raises 2 skeletons once when dropped below 50% HP.
    // Tries flanking offsets with || so one blocked tile still yields a guard.
    onDamaged: `if self.hp < self.maxHp / 2 && !self.memory.raisedGuard; then
  set self.memory.raisedGuard 1
  summon skeleton at self+1,0 || summon skeleton at self+0,1 || summon skeleton at self-1,0
  summon skeleton at self-1,0 || summon skeleton at self+0,-1 || summon skeleton at self+1,0
fi`,
  },
  king_rat: {
    type: 'king_rat',
    faction: 'monster',
    baseVisual: 'rat',
    boss: true,
    dropTable: null,
    name: 'King Rat',
    colors: { body: '#222222', tail: '#333333', eyes: '#ff0000' },
    deathColor: '#222222',
    hp: 55, maxHp: 55, mp: 0, maxMp: 0,
    atk: 10, def: 3, spd: 13, rng: 1, int: 2,
    level: 5, fovRadius: 8,
    resistances: { poison: 5 },
    startingInventory: ['health_potion'],
    // Skirmisher that actually chugs a potion when bloodied rather than fleeing forever.
    script: `if self.hp < self.maxHp / 3 && inventory[type=health_potion]; then
  use health_potion
else if self.hp < self.maxHp / 3 && enemies; then
  enemies | sort-by range | first | flee
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi; fi`,
  },
  glutton_cap: {
    type: 'glutton_cap',
    faction: 'monster',
    baseVisual: 'mushroom',
    boss: true,
    dropTable: null,
    name: 'Glutton Cap',
    colors: { cap: '#6611aa', stalk: '#ccbb99', spores: '#ccffcc' },
    deathColor: '#6611aa',
    hp: 70, maxHp: 70, mp: 20, maxMp: 20,
    atk: 6, def: 4, spd: 4, rng: 3, int: 5,
    level: 6, fovRadius: 7,
    resistances: { poison: 99 },
    onDeath: 'cast poison_cloud at self',
    script: casterScriptPursuit('poison_cloud', 4, 8, 1),
  },
  tarmaw_the_ooze: {
    type: 'tarmaw_the_ooze',
    faction: 'monster',
    baseVisual: 'slime',
    boss: true,
    dropTable: null,
    name: 'Tarmaw the Ooze',
    colors: { body: '#111122', eyes: '#aaff66', drip: '#44dd44' },
    deathColor: '#111122',
    hp: 110, maxHp: 110, mp: 0, maxMp: 0,
    atk: 8, def: 6, spd: 5, rng: 1, int: 3,
    level: 7, fovRadius: 6,
    resistances: { poison: 99, physical: 5 },
    script: AI_MELEE,
  },
  duskwing: {
    type: 'duskwing',
    faction: 'monster',
    baseVisual: 'bat',
    boss: true,
    dropTable: null,
    name: 'Duskwing',
    colors: { body: '#881122', wings: '#220011', eyes: '#ffffff' },
    deathColor: '#881122',
    hp: 60, maxHp: 60, mp: 10, maxMp: 10,
    atk: 11, def: 2, spd: 14, rng: 1, int: 3,
    level: 6, fovRadius: 9,
    resistances: { physical: 2 },
    script: hybridScriptPursuit('drain_life', 4, 6),
  },
  silkweaver: {
    type: 'silkweaver',
    faction: 'monster',
    baseVisual: 'spider',
    boss: true,
    dropTable: null,
    name: 'Silkweaver',
    colors: { body: '#441166', legs: '#772299', eyes: '#cccccc' },
    deathColor: '#441166',
    hp: 65, maxHp: 65, mp: 16, maxMp: 16,
    atk: 10, def: 3, spd: 10, rng: 3, int: 5,
    level: 6, fovRadius: 8,
    resistances: { poison: 99 },
    script: casterScriptPursuit('toxic_line', 5, 9),
  },
  plagueborn: {
    type: 'plagueborn',
    faction: 'undead',
    baseVisual: 'zombie',
    boss: true,
    dropTable: null,
    name: 'Plagueborn',
    colors: { flesh: '#aabb88', rot: '#335533', rags: '#223322' },
    deathColor: '#335533',
    hp: 95, maxHp: 95, mp: 12, maxMp: 12,
    atk: 11, def: 3, spd: 5, rng: 3, int: 4,
    level: 7, fovRadius: 6,
    resistances: { poison: 99, physical: 3 },
    // Bursts into a poison cloud on death — rotten body finally pops.
    onDeath: 'cast poison_cloud at self',
    script: casterScriptPursuit('acid_spray', 4, 7),
  },
  wailing_lady: {
    type: 'wailing_lady',
    faction: 'undead',
    baseVisual: 'ghost',
    boss: true,
    dropTable: null,
    name: 'Wailing Lady',
    colors: { shroud: '#ffffff', eyes: '#4488ff', wisp: '#88bbff' },
    deathColor: '#ffffff',
    hp: 70, maxHp: 70, mp: 20, maxMp: 20,
    atk: 10, def: 2, spd: 10, rng: 4, int: 6,
    level: 7, fovRadius: 9,
    resistances: { physical: 5, lightning: 5 },
    script: casterScriptPursuit('chain_lightning', 5, 10),
  },
  soulreaper: {
    type: 'soulreaper',
    faction: 'undead',
    baseVisual: 'wraith',
    boss: true,
    dropTable: null,
    name: 'Soulreaper',
    colors: { form: '#000000', tendrils: '#111111', core: '#33ff66' },
    deathColor: '#33ff66',
    hp: 100, maxHp: 100, mp: 22, maxMp: 22,
    atk: 13, def: 4, spd: 8, rng: 4, int: 6,
    level: 8, fovRadius: 8,
    resistances: { physical: 5, arcane: 5, poison: 10 },
    script: `if self.hp < self.maxHp / 2 && self.mp >= 6 && enemies; then
  enemies | sort-by range | first | cast drain_life
else if enemies[range<=5] && self.mp >= 6; then
  enemies | sort-by range | first | cast arcane_beam
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi; fi`,
  },
  stormcaller_zyr: {
    type: 'stormcaller_zyr',
    faction: 'monster',
    baseVisual: 'wisp',
    boss: true,
    dropTable: null,
    name: 'Stormcaller Zyr',
    colors: { core: '#ffee88', halo: '#ffffff', sparks: '#ffffaa' },
    deathColor: '#ffee88',
    hp: 75, maxHp: 75, mp: 26, maxMp: 26,
    atk: 8, def: 2, spd: 12, rng: 4, int: 8,
    level: 8, fovRadius: 9,
    resistances: { lightning: 99, physical: 3 },
    script: hybridScriptPursuit('thunderstrike', 5, 11),
  },
  skullarcher_venn: {
    type: 'skullarcher_venn',
    faction: 'undead',
    baseVisual: 'skeleton_archer',
    boss: true,
    dropTable: null,
    name: 'Skullarcher Venn',
    colors: { skull: '#88ff66', limbs: '#222222', bow: '#44aa33' },
    deathColor: '#88ff66',
    hp: 70, maxHp: 70, mp: 10, maxMp: 10,
    atk: 12, def: 3, spd: 10, rng: 5, int: 4,
    level: 7, fovRadius: 9,
    resistances: { poison: 10 },
    script: `if enemies[range<=1]; then
  enemies | sort-by range | first | flee
else if enemies[range<=5] && self.mp >= 10; then
  enemies | sort-by range | first | cast rapid_fire
else if enemies[range<=5]; then
  enemies | sort-by range | first | cast arrow_shot
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi; fi`,
  },
  the_hollow_king: {
    type: 'the_hollow_king',
    faction: 'monster',
    baseVisual: 'knight',
    boss: true,
    dropTable: null,
    name: 'The Hollow King',
    colors: { helmet: '#442211', plate: '#332211', limbs: '#ff2200' },
    deathColor: '#442211',
    hp: 130, maxHp: 130, mp: 14, maxMp: 14,
    atk: 14, def: 7, spd: 8, rng: 1, int: 5,
    level: 9, fovRadius: 8,
    resistances: { physical: 6, poison: 5 },
    // Enters fury exactly once, the first time he's wounded. Memory flag
    // prevents the cast from re-firing on every subsequent hit.
    onDamaged: `if !self.memory.furied && self.mp >= 5; then
  set self.memory.furied 1
  cast battle_fury at self
fi`,
    script: `if player[range<=1]; then
  attack player
else
  approach player
fi`,
  },
  warchief_garnok: {
    type: 'warchief_garnok',
    faction: 'monster',
    baseVisual: 'orc_knight',
    boss: true,
    dropTable: null,
    name: "Warchief Gar'nok",
    colors: { skin: '#aa5533', plate: '#ffcc44', shield: '#221100' },
    deathColor: '#aa5533',
    hp: 120, maxHp: 120, mp: 0, maxMp: 0,
    atk: 15, def: 6, spd: 8, rng: 1, int: 3,
    level: 9, fovRadius: 7,
    resistances: { physical: 4 },
    startingInventory: ['health_potion', 'health_potion'],
    // Once-per-fight enrage when bloodied — +6 atk. Same pattern as troll,
    // scaled to his threat level.
    onDamaged: `if self.hp < self.maxHp / 2 && !self.memory.enraged; then
  set self.memory.enraged 1
  modify atk 6
fi`,
    script: `if self.hp < self.maxHp / 3 && inventory[type=health_potion]; then
  use health_potion
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi`,
  },
  nightmare: {
    type: 'nightmare',
    faction: 'monster',
    baseVisual: 'dragon',
    boss: true,
    dropTable: null,
    name: 'Nightmare',
    colors: { head: '#111122', body: '#111122', wings: '#6622aa' },
    deathColor: '#6622aa',
    hp: 140, maxHp: 140, mp: 24, maxMp: 24,
    atk: 16, def: 5, spd: 10, rng: 2, int: 7,
    level: 10, fovRadius: 9,
    resistances: { fire: 99, arcane: 4 },
    // Opt-in player hunter — predatory, fixates on the mage. Inlined (not
    // via casterScript) so it stays on `player` after the faction migration.
    script: `if player[range<=5] && self.mp >= 8; then
  cast fireball at player
else if player[range<=1]; then
  attack player
else
  approach player
fi; fi`,
  },
  archlich_vormir: {
    type: 'archlich_vormir',
    faction: 'undead',
    baseVisual: 'lich',
    boss: true,
    dropTable: null,
    name: 'Archlich Vormir',
    colors: { robe: '#330055', skull: '#ddccee', staff: '#ccaaff' },
    deathColor: '#330055',
    hp: 110, maxHp: 110, mp: 30, maxMp: 30,
    atk: 9, def: 4, spd: 8, rng: 5, int: 9,
    level: 12, fovRadius: 9,
    resistances: { poison: 99, arcane: 6, physical: 3 },
    startingInventory: ['mana_crystal', 'mana_crystal'],
    // Phase 2: raises a wraith guard once when pushed below 50% HP.
    // Same || fallback pattern as Bonelord so a blocked tile doesn't skip the summon.
    onDamaged: `if self.hp < self.maxHp / 2 && !self.memory.raisedGuard; then
  set self.memory.raisedGuard 1
  summon wraith at self+1,0 || summon wraith at self+0,1 || summon wraith at self-1,0 || summon wraith at self+0,-1
fi`,
    script: `if self.mp < 8 && inventory[type=mana_crystal]; then
  use mana_crystal
else if self.hp < self.maxHp / 3 && self.mp >= 6 && enemies; then
  enemies | sort-by range | first | cast drain_life
else if enemies[range<=5] && self.mp >= 10; then
  enemies | sort-by range | first | cast arcane_nova
else if enemies[range<=5] && self.mp >= 4; then
  enemies | sort-by range | first | cast magic_missile
else if enemies[range<=1]; then
  attack enemies[range<=1]
else if enemies; then
  enemies | sort-by range | first | approach
fi; fi; fi; fi; fi; fi`,
  },
};
