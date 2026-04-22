// Item definitions — pure data with DSL scripts for effects.

import { MONSTER_TEMPLATES } from './entities.js';
import { SPELLS } from './commands.js';
import { SCRIPT_LIBRARY } from './scripts.js';
import { STATUS_DEFS } from './statuses.js';

/**
 * Get display name for an item instance.
 */
export function itemName(item) {
  const def = ITEM_DEFS[item.type];
  return def ? def.name : item.type;
}

// ── Lore books ──────────────────────────────────────────────
// One book per monster type, auto-generated from MONSTER_TEMPLATES.
// Using a book `reveal`s the corresponding catalog entry to 'full'. Books
// are flagged `noRandomSpawn` so they don't pollute the random floor-item
// pool — they drop only from the matching monster type (see deaths.js).

export function bookTypeFor(monsterType) {
  if (!monsterType) return null;
  return `book_of_${monsterType}`;
}

function prettifyName(type) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Spell scrolls ───────────────────────────────────────────
// One scroll per entry in SPELLS, auto-generated. Using a scroll runs
// `learn <spell>`. Flavor (description + color) derives from damageType
// so adding a new spell to SPELLS yields a scroll automatically — no
// ITEM_DEFS entry required. A hand-written `ITEM_DEFS.scroll_<spell>`
// entry would take precedence (spread order at the bottom).

export function scrollTypeFor(spellName) {
  if (!spellName) return null;
  return `scroll_${spellName}`;
}

const SCROLL_FLAVOR = {
  fire:      { desc: 'A scorched parchment',                       color: '#ff7733' },
  frost:     { desc: 'A frost-rimed parchment',                    color: '#88ddff' },
  lightning: { desc: 'A parchment crackling with static',          color: '#ffee44' },
  arcane:    { desc: 'A parchment humming with arcane runes',      color: '#aa66ff' },
  poison:    { desc: 'A parchment stained with toxin',             color: '#88cc66' },
  physical:  { desc: 'A weathered parchment',                      color: '#ccbb99' },
};
const SCROLL_FLAVOR_DEFAULT = { desc: 'A mysterious parchment', color: '#ddcc88' };

function buildScrollDefs() {
  const defs = {};
  for (const key of Object.keys(SPELLS)) {
    const spell = SPELLS[key];
    const flavor = SCROLL_FLAVOR[spell.damageType] || SCROLL_FLAVOR_DEFAULT;
    const displayName = prettifyName(key);
    defs[scrollTypeFor(key)] = {
      name: `Scroll of ${displayName}`,
      type: 'scroll',
      description: `${flavor.desc}. Using it teaches ${key}.`,
      colors: { color: flavor.color },
      script: `learn ${key}`,
    };
  }
  return defs;
}

// ── Script tomes ────────────────────────────────────────────
// One tome per entry in SCRIPT_LIBRARY, auto-generated. Using a tome runs
// `learn-script <name>`, which copies the snippet into the player's script
// library. Tomes render with the book sprite (see render-entities.js).

export function tomeTypeFor(scriptName) {
  if (!scriptName) return null;
  return `tome_${scriptName}`;
}

function buildTomeDefs() {
  const defs = {};
  for (const key of Object.keys(SCRIPT_LIBRARY)) {
    const displayName = prettifyName(key);
    defs[tomeTypeFor(key)] = {
      name: `Tome of ${displayName}`,
      type: 'consumable',
      description: `A slim tome inscribed with a snippet — modify at will. Using it adds "${key}" to your script library.`,
      colors: { color: '#bb88ee' },
      script: `learn-script ${key}`,
    };
  }
  return defs;
}

// ── Status codices ─────────────────────────────────────────
// One codex per entry in STATUS_DEFS, auto-generated. Using a codex runs
// `learn <status>`, which unlocks the status for the player's inflict/apply
// primitives. Same `noRandomSpawn` flag as lore books — these are teaching
// items, not ambient loot.

export function codexTypeFor(statusId) {
  if (!statusId) return null;
  return `codex_of_${statusId}`;
}

function buildCodexDefs() {
  const defs = {};
  for (const key of Object.keys(STATUS_DEFS)) {
    const def = STATUS_DEFS[key];
    const displayName = def.name || prettifyName(key);
    defs[codexTypeFor(key)] = {
      name: `Codex of ${displayName}`,
      type: 'consumable',
      description: `A bound codex detailing the ${displayName} effect. Using it teaches you to inflict or apply ${key}.`,
      colors: { col1: '#334466', col2: '#88aadd' },
      script: `learn ${key}`,
      noRandomSpawn: true,
    };
  }
  return defs;
}

function buildBookDefs() {
  const defs = {};
  for (const key of Object.keys(MONSTER_TEMPLATES)) {
    const tpl = MONSTER_TEMPLATES[key];
    const displayName = tpl.name || prettifyName(key);
    defs[bookTypeFor(key)] = {
      name: `Book of ${displayName}`,
      type: 'consumable',
      description: `A battered tome cataloging ${displayName}. Using it reveals the catalog entry and teaches the summon template.`,
      colors: { col1: '#664433', col2: '#aa8833' },
      script: `learn ${key}`,
      noRandomSpawn: true,
    };
  }
  return defs;
}

export const ITEM_DEFS = {
  mana_crystal: {
    name: 'Mana Crystal',
    type: 'consumable',
    description: 'A shimmering crystal of condensed mana.',
    colors: { color: '#66aaff' },
    script: 'restore mp 10',
  },
  health_potion: {
    name: 'Health Potion',
    type: 'consumable',
    description: 'A vial of glowing red liquid.',
    colors: { color: '#ff4444' },
    script: 'apply regen 5',
  },
  haste_potion: {
    name: 'Haste Potion',
    type: 'consumable',
    description: 'A swirling amber liquid. Grants supernatural speed.',
    colors: { color: '#ffaa33' },
    script: 'apply haste 4',
  },
  shield_potion: {
    name: 'Shield Potion',
    type: 'consumable',
    description: 'A thick silver liquid. Creates a protective barrier.',
    colors: { color: '#aaaadd' },
    script: 'apply shield 5',
  },
  cleanse_potion: {
    name: 'Cleanse Potion',
    type: 'consumable',
    description: 'A clear, purifying tonic. Removes poison, burn, and slow.',
    colors: { color: '#88ffaa' },
    script: 'cleanse poison; cleanse burn; cleanse slow',
  },
  mana_regen_potion: {
    name: 'Mana Regen Potion',
    type: 'consumable',
    description: 'A glowing blue tonic. Restores mana over time.',
    colors: { color: '#6688ff' },
    script: 'apply mana_regen 5',
  },
  fire_ward_potion: {
    name: 'Fire Ward Potion',
    type: 'consumable',
    description: 'A ruby tonic that coats you in a heat-shrugging aura.',
    colors: { color: '#ff6622' },
    script: 'apply fire_ward 50 5',
  },
  frost_ward_potion: {
    name: 'Frost Ward Potion',
    type: 'consumable',
    description: 'An icy tincture. Dulls the bite of cold.',
    colors: { color: '#66ddff' },
    script: 'apply frost_ward 50 5',
  },
  arcane_ward_potion: {
    name: 'Arcane Ward Potion',
    type: 'consumable',
    description: 'A violet draught humming with quiet magic. Deflects raw arcane force.',
    colors: { color: '#aa66ff' },
    script: 'apply arcane_ward 50 5',
  },
  magic_ward_potion: {
    name: 'Magic Ward Potion',
    type: 'consumable',
    description: 'A pearlescent elixir. Thins every school of magic that touches you — but not poison.',
    colors: { color: '#ffffff' },
    script: 'apply magic_ward 40 3',
  },
  lightning_ward_potion: {
    name: 'Lightning Ward Potion',
    type: 'consumable',
    description: 'A fizzing yellow tonic. Grounds incoming electrical damage.',
    colors: { color: '#ffee44' },
    script: 'apply lightning_ward 50 5',
  },
  poison_ward_potion: {
    name: 'Poison Ward Potion',
    type: 'consumable',
    description: 'A bitter green draft. Steels the body against toxins.',
    colors: { color: '#66cc66' },
    script: 'apply poison_ward 50 5',
  },
  potion_of_fury: {
    name: 'Potion of Fury',
    type: 'consumable',
    description: 'A seething crimson draught. Sharpens strikes and quickens the hand.',
    colors: { col1: '#99aacc', col2: '#ff4422' },
    script: 'apply might 5\napply haste 5',
  },
  potion_of_warding: {
    name: 'Potion of Warding',
    type: 'consumable',
    description: 'A silvered brew. Hardens skin and blunts every school of magic.',
    colors: { col1: '#99aacc', col2: '#ccccee' },
    script: 'apply iron_skin 5\napply magic_ward 30 5',
  },
  potion_of_focus: {
    name: 'Potion of Focus',
    type: 'consumable',
    description: 'A deep blue draught. Sustains mana while shielding the caster.',
    colors: { col1: '#99aacc', col2: '#6688ff' },
    script: 'apply mana_regen 6\napply shield 5',
  },

  // ── Permanent stat elixirs ─────────────────────────────────
  // Each additively raises the *base* stat via `modify` — unlike equipment
  // (`merge`, monotone-max into the aggregate), elixirs stack with every
  // drink. maxHp/maxMp modifications also lift the current pool so the
  // drinker feels the effect immediately.
  vitality_elixir: {
    name: 'Vitality Elixir',
    type: 'consumable',
    description: 'A thick crimson syrup. Permanently strengthens the body.',
    colors: { col1: '#99aacc', col2: '#cc2244' },
    script: 'modify maxHp 10',
  },
  focus_elixir: {
    name: 'Focus Elixir',
    type: 'consumable',
    description: 'A cool sapphire tonic. Permanently deepens the mana well.',
    colors: { col1: '#99aacc', col2: '#3366cc' },
    script: 'modify maxMp 10',
  },
  might_elixir: {
    name: 'Might Elixir',
    type: 'consumable',
    description: 'A rust-red draught. Permanently strengthens the arm.',
    colors: { col1: '#99aacc', col2: '#aa4422' },
    script: 'modify atk 2',
  },
  guard_elixir: {
    name: 'Guard Elixir',
    type: 'consumable',
    description: 'A steel-grey brew. Permanently toughens the skin.',
    colors: { col1: '#99aacc', col2: '#8899aa' },
    script: 'modify def 2',
  },
  swift_elixir: {
    name: 'Swift Elixir',
    type: 'consumable',
    description: 'A pale yellow tincture. Permanently quickens the step.',
    colors: { col1: '#99aacc', col2: '#ddee66' },
    script: 'modify spd 1',
  },
  insight_elixir: {
    name: 'Insight Elixir',
    type: 'consumable',
    description: 'A luminous violet draught. Permanently sharpens the mind.',
    colors: { col1: '#99aacc', col2: '#aa66ff' },
    script: 'modify int 3',
  },

  // ── Equipment ──────────────────────────────────────────────
  // Equipment items use their type slot (staff, robe, ...) rather than
  // 'consumable'. `use` runs the script (typically `merge ...`) and
  // consumes the item — the aggregate sticks on player.equipment.
  wooden_staff: {
    name: 'Wooden Staff',
    type: 'staff',
    description: 'A plain wizard\'s staff. Steadies the weave.',
    colors: { col1: '#8B5E3C', col2: '#a06030' },
    script: 'merge int 3',
  },
  leather_robe: {
    name: 'Leather Robe',
    type: 'robe',
    description: 'Supple leather — modest protection, a touch more vitality.',
    colors: { col1: '#44332a', col2: '#776655' },
    // Newline separates block statements; the parser only recognizes multi-
    // statement blocks across newlines (not semicolons at top level).
    script: 'merge def 2\nmerge maxHp 5',
  },
  fire_staff: {
    name: 'Fire Staff',
    type: 'staff',
    description: 'A rune-carved staff; coals smoulder at its head. Attunes the wielder to flame.',
    colors: { col1: '#332211', col2: '#ff6600' },
    script: 'merge int 8\nmerge fire_affinity perm',
  },
  venom_dagger: {
    name: 'Venom Dagger',
    type: 'dagger',
    description: 'A thin blade laced with slow-acting toxin. Each strike injects poison.',
    colors: { col1: '#88cc66', col2: '#445533' },
    script: 'merge atk 2\non_hit inflict poison $TARGET 4 $L',
  },
  // ── Staves (int) ──────────────────────────────────────────
  iron_staff: {
    name: 'Iron Staff',
    type: 'staff',
    description: 'A banded iron shaft. Steady channel, deeper reserves.',
    colors: { col1: '#778899', col2: '#66aaff' },
    script: 'merge int 6\nmerge maxMp 10',
  },

  // ── Daggers (atk) ─────────────────────────────────────────
  bone_dagger: {
    name: 'Bone Dagger',
    type: 'dagger',
    description: 'A crude, sharpened bone. Light and quick.',
    colors: { col1: '#ddccaa', col2: '#aa8866' },
    script: 'merge atk 3',
  },
  steel_dagger: {
    name: 'Steel Dagger',
    type: 'dagger',
    description: 'A well-balanced blade. Faster in the hand than it looks.',
    colors: { col1: '#ccccdd', col2: '#887766' },
    script: 'merge atk 5\nmerge spd 1',
  },

  // ── Hats (int / maxHp) ────────────────────────────────────
  cloth_cap: {
    name: 'Cloth Cap',
    type: 'hat',
    description: 'A padded cap. A little more room to take a blow.',
    colors: { col1: '#886644', col2: '#aa8855' },
    script: 'merge maxHp 6',
  },
  wizard_hat: {
    name: 'Wizard Hat',
    type: 'hat',
    description: 'Pointed, star-stitched. Classic for a reason.',
    colors: { col1: '#4422aa', col2: '#aa88ff' },
    script: 'merge int 4',
  },
  scholar_circlet: {
    name: 'Scholar Circlet',
    type: 'hat',
    description: 'A slim silver band etched with runes. Sharpens thought.',
    colors: { col1: '#110022', col2: '#6633aa' },
    script: 'merge int 6\nmerge maxMp 8',
  },

  // ── Robes (def) ───────────────────────────────────────────
  silk_robe: {
    name: 'Silk Robe',
    type: 'robe',
    description: 'Woven silk with arcane threading. Light, but magically resilient.',
    colors: { col1: '#334488', col2: '#8877aa' },
    script: 'merge def 3\nmerge maxMp 10',
  },
  ember_robe: {
    name: 'Ember Robe',
    type: 'robe',
    description: 'Dark cloth shot through with smouldering threads. Attunes to flame.',
    colors: { col1: '#1a1a2a', col2: '#ff6633' },
    script: 'merge def 3\nmerge fire_affinity perm',
  },

  // ── Staves (extended) ─────────────────────────────────────
  shock_staff: {
    name: 'Shock Staff',
    type: 'staff',
    description: 'A crackling staff. Each touch jolts the target.',
    colors: { col1: '#223344', col2: '#ffee44' },
    script: 'merge int 5\non_hit inflict shock $TARGET 15 $L',
  },
  draining_staff: {
    name: 'Draining Staff',
    type: 'staff',
    description: 'A hollow obsidian rod. Saps the mind on contact.',
    colors: { col1: '#1a1a2a', col2: '#aa44ff' },
    script: 'merge int 6\non_hit inflict mana_burn $TARGET 4 $L',
  },
  crystal_staff: {
    name: 'Crystal Staff',
    type: 'staff',
    description: 'A pure crystalline focus. Sharpens the intellect to a fine edge.',
    colors: { col1: '#aaddff', col2: '#ffffff' },
    script: 'merge int 10',
  },

  // ── Daggers (extended) ────────────────────────────────────
  shadow_blade: {
    name: 'Shadow Blade',
    type: 'dagger',
    description: 'A dark blade that strips armor on each strike.',
    colors: { col1: '#221133', col2: '#9944cc' },
    script: 'merge atk 4\non_hit inflict expose $TARGET 3 $L',
  },
  frost_shard: {
    name: 'Frost Shard',
    type: 'dagger',
    description: 'A shard of enchanted ice. Chills the target on contact.',
    colors: { col1: '#aaddff', col2: '#ffffff' },
    script: 'merge atk 3\non_hit inflict chill $TARGET 2 $L',
  },
  warblade: {
    name: 'Warblade',
    type: 'dagger',
    description: 'A heavy fighting knife. No tricks — just steel.',
    colors: { col1: '#888899', col2: '#cccccc' },
    script: 'merge atk 6\nmerge spd 1',
  },

  // ── Hats (extended) ───────────────────────────────────────
  iron_helm: {
    name: 'Iron Helm',
    type: 'hat',
    description: 'A solid iron cap. Slows thought, hardens the skull.',
    colors: { col1: '#556677', col2: '#99aabb' },
    script: 'merge def 3\nmerge maxHp 10',
  },
  arcane_cowl: {
    name: 'Arcane Cowl',
    type: 'hat',
    description: 'A deep hood stitched with binding runes. Channels power.',
    colors: { col1: '#221144', col2: '#8855cc' },
    script: 'merge int 7\nmerge maxMp 5',
  },
  crown_of_ages: {
    name: 'Crown of Ages',
    type: 'hat',
    description: 'An ancient circlet. Balanced in all things.',
    colors: { col1: '#443300', col2: '#ddaa33' },
    script: 'merge int 5\nmerge def 2\nmerge maxHp 5',
  },

  // ── Robes (extended) ──────────────────────────────────────
  chain_vestment: {
    name: 'Chain Vestment',
    type: 'robe',
    description: 'Linked rings over padded cloth. Heavy but reassuring.',
    colors: { col1: '#556677', col2: '#aabbcc' },
    script: 'merge def 5\nmerge maxHp 8',
  },
  archmage_robe: {
    name: "Archmage's Robe",
    type: 'robe',
    description: 'Deep-dyed velvet. The mana flows freely within.',
    colors: { col1: '#0d0022', col2: '#6633cc' },
    script: 'merge def 4\nmerge maxMp 15',
  },
  shadow_cloak: {
    name: 'Shadow Cloak',
    type: 'robe',
    description: 'A cloak of shifting darkness. Swift and deadly.',
    colors: { col1: '#111122', col2: '#553388' },
    script: 'merge def 2\nmerge atk 3\nmerge spd 1',
  },

  // ── Foci (int specialist) ─────────────────────────────────
  quartz_focus: {
    name: 'Quartz Focus',
    type: 'focus',
    description: 'A rough quartz crystal. Clarifies the weave.',
    colors: { col1: '#cceeff', col2: '#aaddff' },
    script: 'merge int 3',
  },
  runed_focus: {
    name: 'Runed Focus',
    type: 'focus',
    description: 'A palm-sized rune stone. Deepens reserves and sharpens thought.',
    colors: { col1: '#334455', col2: '#aa88cc' },
    script: 'merge int 5\nmerge maxMp 8',
  },
  void_focus: {
    name: 'Void Focus',
    type: 'focus',
    description: 'A shard of something that should not exist. The mind sharpens — painfully.',
    colors: { col1: '#1a0033', col2: '#6622aa' },
    script: 'merge int 9',
  },

  // ── Foci (extended) ───────────────────────────────────────
  bloodstone: {
    name: 'Bloodstone',
    type: 'focus',
    description: 'A deep red stone, warm to the touch. Binds mind to body.',
    colors: { col1: '#440011', col2: '#cc2244' },
    script: 'merge int 4\nmerge maxHp 12',
  },
  star_fragment: {
    name: 'Star Fragment',
    type: 'focus',
    description: 'A shard of fallen star. Mana pools around it.',
    colors: { col1: '#112233', col2: '#88ccff' },
    script: 'merge int 6\nmerge maxMp 12',
  },
  prism_shard: {
    name: 'Prism Shard',
    type: 'focus',
    description: 'A many-faceted gem. Balances offense and defence.',
    colors: { col1: '#334455', col2: '#aaccee' },
    script: 'merge int 3\nmerge def 3\nmerge maxHp 5',
  },

  // Spell scrolls — spread before books so either can override an earlier
  // hand-written entry. See buildScrollDefs / scrollTypeFor above.
  ...buildScrollDefs(),

  // Script tomes — auto-generated from SCRIPT_LIBRARY.
  ...buildTomeDefs(),

  // Lore books — spread in last so a monster-specific ITEM_DEFS entry could
  // still override (none do today). See buildBookDefs / bookTypeFor above.
  ...buildBookDefs(),

  // Status codices — auto-generated from STATUS_DEFS.
  ...buildCodexDefs(),
};
