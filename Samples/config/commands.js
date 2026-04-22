// Command/spell definitions — pure data.
//
// Spells are stored as DSL scripts (the `body` field). Casting a spell runs
// its body with `$TARGET` bound to the target id; the body composes the 8
// spell primitives (project / explode / spawn-cloud / inflict / heal / summon
// / teleport / push) to produce effects. MP is pay-as-you-go — each primitive
// charges its own cost, so `mpCost` here is display-only (shown in `spells`
// and the spell man-page header).
//
// Adding a new spell:
//   1. Add an entry here with name, description, damageType (school),
//      mpCost (display), and body.
//   2. That's it. Scrolls, help pages, tab completion are all generated
//      from this table.
//
// `damageType` is the school used for scroll flavor coloring and school
// multiplier lookup. It does not directly affect the body's computation —
// the body's own `element=` flags drive school scaling per primitive.

import { validateDamageType } from './damage-types.js';

// Default per-level linear scaling rate — still used by melee damage
// (see MELEE_SCALING below). Kept here for backward compat with combat.js.
export const LEVEL_RATE = 0.25;

// Melee scaling (attacker.level → damage). Range intentionally unscaled —
// longer reach belongs to weapons/wearables, not raw leveling.
export const MELEE_SCALING = { damage: LEVEL_RATE };

export const SPELLS = {
  // ── Fire ─────────────────────────────────────────────────────────────────
  firebolt: {
    name: 'firebolt',
    description: 'Hurls a bolt of fire at the target.',
    damageType: 'fire',
    mpCost: 4,
    body: 'project $TARGET damage=8 element=fire range=5 | inflict status=burn duration=2 power=3',
  },
  fireball: {
    name: 'fireball',
    description: 'An exploding fireball — burns everything in a wide circle.',
    damageType: 'fire',
    mpCost: 10,
    body: 'explode $TARGET damage=5 element=fire radius=3 friendly=true | each | inflict status=burn duration=2 power=1',
  },
  immolate: {
    name: 'immolate',
    description: 'Sears a single target with focused flame — long, heavy burn.',
    damageType: 'fire',
    mpCost: 10,
    body: 'project $TARGET damage=14 element=fire range=4 visual=bolt_red | inflict status=burn duration=5 power=5',
  },
  fire_wall: {
    name: 'fire_wall',
    description: 'Lays a line of fire from the caster toward the target.',
    damageType: 'fire',
    mpCost: 11,
    body: 'spawn-cloud $TARGET kind=fire shape=line length=4 duration=3 power=2 friendly=true',
  },
  flame_ward: {
    name: 'flame_ward',
    description: 'Wreathes the caster in protective flame — resists fire damage.',
    damageType: 'fire',
    mpCost: 6,
    body: 'inflict self status=fire_ward duration=50 power=5',
  },
  battle_fury: {
    name: 'battle_fury',
    description: 'Unleashes inner fire — attacks hit harder, but so do enemies.',
    damageType: 'fire',
    mpCost: 7,
    body: 'inflict self status=enrage duration=25 power=5',
  },

  // ── Frost ────────────────────────────────────────────────────────────────
  frostbolt: {
    name: 'frostbolt',
    description: 'Launches a shard of ice at the target.',
    damageType: 'frost',
    mpCost: 5,
    body: 'project $TARGET damage=6 element=frost range=4 | inflict status=slow duration=3 power=3',
  },
  blizzard: {
    name: 'blizzard',
    description: 'A howling storm of freezing wind and ice over a wide area.',
    damageType: 'frost',
    mpCost: 14,
    body: 'explode $TARGET damage=4 element=frost radius=4 friendly=true visual=burst_frost | each | inflict status=slow duration=3 power=3',
  },
  glaciate: {
    name: 'glaciate',
    description: 'Encases a target in crushing ice — heavy damage and deep slow.',
    damageType: 'frost',
    mpCost: 12,
    body: 'project $TARGET damage=16 element=frost range=4 visual=beam_frost | inflict status=slow duration=6 power=5',
  },
  ice_wall: {
    name: 'ice_wall',
    description: 'Lays a line of freezing fog — chills anyone crossing it.',
    damageType: 'frost',
    mpCost: 10,
    body: 'spawn-cloud $TARGET kind=frost shape=line length=5 duration=3 power=2 friendly=true',
  },
  ice_ward: {
    name: 'ice_ward',
    description: 'Conjures a crystalline barrier against frost damage.',
    damageType: 'frost',
    mpCost: 6,
    body: 'inflict self status=frost_ward duration=50 power=5',
  },
  glacial_armor: {
    name: 'glacial_armor',
    description: 'Encases the caster in rune-hard ice — greatly increases defense.',
    damageType: 'frost',
    mpCost: 8,
    body: 'inflict self status=iron_skin duration=50 power=8',
  },

  // ── Lightning ────────────────────────────────────────────────────────────
  lightning_bolt: {
    name: 'lightning_bolt',
    description: 'A jagged arc of electricity — leaves the target shocked.',
    damageType: 'lightning',
    mpCost: 7,
    body: 'project $TARGET damage=9 element=lightning range=5 visual=zigzag_yellow | inflict status=shock duration=3 power=3',
  },
  chain_lightning: {
    name: 'chain_lightning',
    description: 'Arcs lightning from the target to all enemies nearby.',
    damageType: 'lightning',
    mpCost: 12,
    body: 'explode $TARGET damage=7 element=lightning radius=2 friendly=true visual=burst_shock | each | inflict status=shock duration=3 power=2',
  },
  thunderstrike: {
    name: 'thunderstrike',
    description: 'Calls down a thunderous blast — stuns briefly on impact.',
    damageType: 'lightning',
    mpCost: 11,
    body: 'project $TARGET damage=13 element=lightning range=4 visual=zigzag_white | inflict status=stun duration=3 power=8',
  },
  storm_wall: {
    name: 'storm_wall',
    description: 'Charges a line of air — shocks anything crossing it.',
    damageType: 'lightning',
    mpCost: 11,
    body: 'spawn-cloud $TARGET kind=lightning shape=line length=4 duration=3 power=2 friendly=true',
  },
  storm_ward: {
    name: 'storm_ward',
    description: 'Shields the caster against lightning damage.',
    damageType: 'lightning',
    mpCost: 6,
    body: 'inflict self status=lightning_ward duration=50 power=5',
  },
  static_charge: {
    name: 'static_charge',
    description: 'Courses the caster with electric energy — greatly increases speed.',
    damageType: 'lightning',
    mpCost: 7,
    body: 'inflict self status=haste duration=40 power=4',
  },

  // ── Arcane ───────────────────────────────────────────────────────────────
  magic_missile: {
    name: 'magic_missile',
    description: 'A guided dart of pure magical force.',
    damageType: 'arcane',
    mpCost: 6,
    body: 'project $TARGET damage=7 element=arcane range=5 visual=orbs_violet',
  },
  arcane_beam: {
    name: 'arcane_beam',
    description: 'Focused beam of raw arcane energy — scales heavily with INT.',
    damageType: 'arcane',
    mpCost: 9,
    body: 'project $TARGET damage=10 element=arcane range=6 visual=beam_arcane',
  },
  arcane_nova: {
    name: 'arcane_nova',
    description: 'Explosive burst of arcane force — exposes enemies to further damage.',
    damageType: 'arcane',
    mpCost: 11,
    body: 'explode $TARGET damage=6 element=arcane radius=3 friendly=true visual=burst_arcane | each | inflict status=expose duration=4 power=4',
  },
  drain_life: {
    name: 'drain_life',
    description: 'Tears vitality from the target — harms them, heals the caster.',
    damageType: 'arcane',
    mpCost: 11,
    body: 'project $TARGET damage=8 element=arcane range=4 visual=beam_drain && heal self amount=5',
  },
  mage_ward: {
    name: 'mage_ward',
    description: 'Wards the caster against arcane damage.',
    damageType: 'arcane',
    mpCost: 6,
    body: 'inflict self status=arcane_ward duration=50 power=5',
  },
  clarity: {
    name: 'clarity',
    description: 'Clears the mind — mana regenerates steadily for a time.',
    damageType: 'arcane',
    mpCost: 5,
    body: 'inflict self status=mana_regen duration=50 power=4',
  },

  // ── Arcane — movement / control (new in 0.27.15) ─────────────────────────
  blink: {
    name: 'blink',
    description: 'Teleport yourself to a random nearby tile — classic escape.',
    damageType: 'arcane',
    mpCost: 6,
    body: 'teleport self random=true range=6',
  },
  banish: {
    name: 'banish',
    description: 'Hurl the target away to a random distant tile.',
    damageType: 'arcane',
    mpCost: 10,
    body: 'teleport $TARGET random=true range=12',
  },
  force_push: {
    name: 'force_push',
    description: 'Raw force shoves the target away along the line from you.',
    damageType: 'arcane',
    mpCost: 5,
    body: 'push $TARGET distance=3',
  },
  gravity_well: {
    name: 'gravity_well',
    description: 'Drag every nearby creature two tiles toward you.',
    damageType: 'arcane',
    mpCost: 9,
    body: 'scan monsters[range<=4] | each | push distance=-2',
  },

  // ── Poison ───────────────────────────────────────────────────────────────
  venom_bolt: {
    name: 'venom_bolt',
    description: 'A glob of virulent toxin — poisons deeply on contact.',
    damageType: 'poison',
    mpCost: 6,
    body: 'project $TARGET damage=6 element=poison range=4 | inflict status=poison duration=8 power=3',
  },
  poison_cloud: {
    name: 'poison_cloud',
    description: 'Conjures a lingering cloud of toxic gas around the target tile.',
    damageType: 'poison',
    mpCost: 10,
    body: 'spawn-cloud $TARGET kind=poison radius=2 duration=4 power=2 friendly=false',
  },
  acid_spray: {
    name: 'acid_spray',
    description: 'Sprays corrosive acid — exposes armor across an area.',
    damageType: 'poison',
    mpCost: 11,
    body: 'explode $TARGET damage=4 element=poison radius=3 friendly=true visual=burst_acid | each | inflict status=expose duration=4 power=4',
  },
  toxic_line: {
    name: 'toxic_line',
    description: 'A streaming line of poisonous vapor — area denial.',
    damageType: 'poison',
    mpCost: 11,
    body: 'spawn-cloud $TARGET kind=poison shape=line length=6 duration=4 power=2 friendly=false',
  },
  venom_ward: {
    name: 'venom_ward',
    description: 'Fortifies the caster against poison damage.',
    damageType: 'poison',
    mpCost: 6,
    body: 'inflict self status=poison_ward duration=50 power=5',
  },
  mending: {
    name: 'mending',
    description: 'Draws on natural magic — restores health over time.',
    damageType: 'poison',
    mpCost: 7,
    body: 'inflict self status=regen duration=50 power=4',
  },

  // ── Physical (ranged) ────────────────────────────────────────────────────
  arrow_shot: {
    name: 'arrow_shot',
    description: 'Looses a swift arrow — opens a bleeding wound.',
    damageType: 'physical',
    mpCost: 3,
    body: 'project $TARGET damage=8 element=physical range=6 visual=arrow_wood | inflict status=bleed duration=6 power=2',
  },
  rock_throw: {
    name: 'rock_throw',
    description: 'Hurls a heavy stone — stuns briefly on impact.',
    damageType: 'physical',
    mpCost: 4,
    body: 'project $TARGET damage=10 element=physical range=4 visual=thrown_stone | inflict status=stun duration=3 power=8',
  },
  rapid_fire: {
    name: 'rapid_fire',
    description: 'Fires a volley of three quick arrows — no frills, pure damage.',
    damageType: 'physical',
    mpCost: 6,
    body: 'project $TARGET damage=14 element=physical range=5 visual=arrow_wood',
  },
  smoke_bomb: {
    name: 'smoke_bomb',
    description: 'Hurls a flask that bursts into a blinding cloud of smoke.',
    damageType: 'physical',
    mpCost: 8,
    body: 'spawn-cloud $TARGET kind=smoke radius=2 duration=5 power=1 friendly=true',
  },

  // ── Summoning ────────────────────────────────────────────────────────────
  raise_skeleton: {
    name: 'raise_skeleton',
    description: 'Knit old bone into a loyal servant. Permanent until slain.',
    damageType: 'arcane',
    mpCost: 12,
    body: 'summon self template=skeleton',
  },
  summon_fire_imp: {
    name: 'summon_fire_imp',
    description: 'Conjure a mote of living flame to fight alongside you.',
    damageType: 'fire',
    mpCost: 14,
    body: 'summon self template=fire_elemental duration=30',
  },
  summon_frost_wisp: {
    name: 'summon_frost_wisp',
    description: 'Pull a shard of mist from the air as a chilling servant.',
    damageType: 'frost',
    mpCost: 13,
    body: 'summon self template=water_elemental duration=30',
  },
  summon_storm_wisp: {
    name: 'summon_storm_wisp',
    description: 'Bind a crackling ball of lightning to your will.',
    damageType: 'lightning',
    mpCost: 13,
    body: 'summon self template=wisp duration=30',
  },
  summon_serpent: {
    name: 'summon_serpent',
    description: 'Call a venomous serpent from the shadows to strike your foes.',
    damageType: 'poison',
    mpCost: 13,
    body: 'summon self template=serpent duration=30',
  },
};

// Load-time validation — every spell MUST declare a damageType. Fail loud
// here instead of silently defaulting when a spell lands a hit later.
for (const [id, s] of Object.entries(SPELLS)) {
  validateDamageType(s.damageType, `SPELLS.${id}`);
  if (typeof s.body !== 'string' || s.body.trim() === '') {
    throw new Error(`SPELLS.${id} missing body script.`);
  }
}
