// Tab completion — maps cursor context to candidate lists.

import { getAvailableCommands, getPlayerVariables } from '../dsl/command-registry.js';
import { SPELLS } from '../config/commands.js';
import { HELP_TOPIC_NAMES } from '../dsl/help-pages.js';
import { isVisible, isAlive } from '../engine/game-state.js';
import { ITEM_DEFS } from '../config/items.js';

// ── Static candidate pools ─────────────────────────────────

const SELECTOR_KEYWORDS = [
  'monsters', 'items', 'inventory', 'self', 'player',
  'allies', 'enemies', 'others', 'clouds', 'rooms', 'tiles', 'objects',
];

// Properties usable with sort-by, pick, and bracket filters
const PROPERTIES = [
  'hp', 'maxhp', 'mp', 'maxmp', 'atk', 'def', 'spd', 'int',
  'rng', 'level', 'x', 'y', 'type', 'id', 'range', 'faction', 'fovradius',
];

// Built-in env vars as the user types them (uppercase $NAME)
const ENV_VAR_NAMES = [
  'HP', 'MAXHP', 'MP', 'MAXMP', 'ATK', 'DEF', 'SPD', 'INT', 'RNG',
  'LEVEL', 'ENERGY', 'ENERGY_MAX', 'X', 'Y', 'TURN', 'TICK', 'DEPTH',
  'L', 'P', 'NP', 'TARGET',
];

const SCRIPT_CMDS  = new Set(['run', 'cat', 'rm', 'edit', 'unalias']);
const MONSTER_CMDS = new Set(['flee', 'distance', 'cansee']);

const EQUIPMENT_SLOT_TYPES = new Set(['staff', 'dagger', 'hat', 'robe', 'focus']);

// ── Helpers ────────────────────────────────────────────────

function filterByPrefix(candidates, partial) {
  const safe = candidates.filter(c => typeof c === 'string');
  if (!partial) return safe;
  const lower = partial.toLowerCase();
  return safe.filter(c => c.toLowerCase().startsWith(lower));
}

function visibleMonsterIds(state) {
  return state.monsters
    .filter(m => isAlive(m) && isVisible(state, m.x, m.y))
    .map(m => m.id);
}

function inventoryTypes(state) {
  return [...new Set(state.player.inventory.map(i => i.type))];
}

function inventoryWearableIds(state) {
  return state.player.inventory
    .filter(i => EQUIPMENT_SLOT_TYPES.has(ITEM_DEFS[i.type]?.type))
    .map(i => i.id);
}

function attackableMonsterIds(state) {
  const { x, y, rng = 1 } = state.player;
  return state.monsters
    .filter(m => isAlive(m) && isVisible(state, m.x, m.y) &&
      Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) <= rng)
    .map(m => m.id);
}

function floorItemTypes(state) {
  return [...new Set(
    state.floorItems
      .filter(i => isVisible(state, i.x, i.y))
      .map(i => i.type),
  )];
}

function visibleObjectIds(state) {
  return (state.floorObjects || [])
    .filter(o => isVisible(state, o.x, o.y))
    .map(o => o.id);
}

function adjacentObjectIds(state) {
  const { x, y } = state.player;
  return (state.floorObjects || [])
    .filter(o => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 1)
    .map(o => o.id);
}

function adjacentDoorIds(state) {
  const { x, y } = state.player;
  return (state.floorObjects || [])
    .filter(o => o.type === 'door' && Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 1)
    .map(o => o.id);
}

function roomIds(state) {
  return (state.rooms || []).map(r => r.id);
}

// ── Input parser ───────────────────────────────────────────

// Split input into tokens on whitespace and DSL operators.
// Returns { partial, prevTokens } where partial is the word currently
// being typed and prevTokens are all tokens that came before it.
function parseInput(input) {
  const parts = input.split(/[\s|;&]+/);
  const endsWithSep = input.length > 0 && /[\s|;&]$/.test(input);
  if (endsWithSep || input === '') {
    return { partial: '', prevTokens: parts.filter(Boolean) };
  }
  return {
    partial:    parts[parts.length - 1] ?? '',
    prevTokens: parts.slice(0, -1).filter(Boolean),
  };
}

// ── Main export ────────────────────────────────────────────

/**
 * Return completion candidates for the current input.
 * Each candidate replaces the partial word at the end of input.
 */
export function getCompletions(input, state) {
  const { partial, prevTokens } = parseInput(input);
  const lastToken  = prevTokens[prevTokens.length - 1] ?? null;
  const firstToken = prevTokens[0] ?? null;

  // $variable completion — env vars and user-defined vars
  if (partial.startsWith('$')) {
    const envCandidates  = ENV_VAR_NAMES.map(v => '$' + v);
    const userCandidates = [...getPlayerVariables().keys()].map(k => '$' + k);
    return filterByPrefix([...envCandidates, ...userCandidates], partial);
  }

  // First-word position → command names
  if (prevTokens.length === 0) {
    return filterByPrefix(getAvailableCommands(), partial);
  }

  // cast <spell> — spell names from player's known spells
  if (lastToken === 'cast') {
    const known = state.player.knownSpells ?? Object.keys(SPELLS);
    return filterByPrefix(known, partial);
  }

  // cast <spell> at <target> / summon <template> at <target>
  if (lastToken === 'at' && (firstToken === 'cast' || firstToken === 'summon')) {
    return filterByPrefix([...visibleMonsterIds(state), 'self'], partial);
  }

  // help <topic>
  if (lastToken === 'help') {
    const spellNames = Object.keys(SPELLS);
    return filterByPrefix([...HELP_TOPIC_NAMES, ...spellNames], partial);
  }

  // Script-management commands
  if (SCRIPT_CMDS.has(lastToken)) {
    return filterByPrefix(Object.keys(state.player.scripts ?? {}), partial);
  }

  // Single-target monster commands
  if (MONSTER_CMDS.has(lastToken)) {
    return filterByPrefix(visibleMonsterIds(state), partial);
  }

  // attack → monsters within attack range only
  if (lastToken === 'attack') {
    return filterByPrefix(attackableMonsterIds(state), partial);
  }

  // inspect → monsters + inventory + floor items + dungeon objects + rooms + self
  if (lastToken === 'inspect') {
    return filterByPrefix(
      [...visibleMonsterIds(state), ...inventoryTypes(state), ...floorItemTypes(state),
        ...visibleObjectIds(state), ...roomIds(state), 'self'],
      partial,
    );
  }

  // use → inventory consumable types + wearable item ids + adjacent dungeon object ids
  if (lastToken === 'use') {
    return filterByPrefix(
      [...inventoryTypes(state), ...inventoryWearableIds(state), ...adjacentObjectIds(state)],
      partial,
    );
  }

  // drop → inventory item types only
  if (lastToken === 'drop') {
    return filterByPrefix(inventoryTypes(state), partial);
  }

  // open / close → adjacent door ids
  if (lastToken === 'open' || lastToken === 'close') {
    return filterByPrefix(adjacentDoorIds(state), partial);
  }

  // approach → monsters + floor item types + dungeon objects + rooms
  if (lastToken === 'approach') {
    return filterByPrefix(
      [...visibleMonsterIds(state), ...floorItemTypes(state),
        ...visibleObjectIds(state), ...roomIds(state)],
      partial,
    );
  }

  // pickup → visible floor item types
  if (lastToken === 'pickup') {
    return filterByPrefix(floorItemTypes(state), partial);
  }

  // sort-by / pick → entity property names
  if (lastToken === 'sort-by' || lastToken === 'pick') {
    return filterByPrefix(PROPERTIES, partial);
  }

  // Bare word in a pipe/chain → monster IDs + selector keywords
  if (lastToken === '|' || lastToken === '&&' || lastToken === '||') {
    return filterByPrefix([...visibleMonsterIds(state), ...SELECTOR_KEYWORDS], partial);
  }

  return [];
}

/**
 * Apply a completion candidate to the original input string.
 * Replaces the partial word at the end with the candidate.
 */
export function applyCompletion(base, candidate) {
  const m = base.match(/^([\s\S]*[\s|;&])?(.*)$/);
  const prefix = m?.[1] ?? '';
  return prefix + candidate;
}
