// Persistence — localStorage save/load for meta-progression and run checkpoints.

import { itemName } from '../config/items.js';

const SAVE_VERSION = 10;
const KEY_META = 'commandDungeon_meta';
const KEY_RUN  = 'commandDungeon_run';

// ── Meta (survives death) ─────────────────────────────────

function defaultMeta() {
  return {
    version: SAVE_VERSION,
    knownCommands: null,
    knownSpells: null,
    scripts: null,
    highScores: [],
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY_META);
    if (!raw) return defaultMeta();
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return defaultMeta();
    return data;
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(state) {
  const meta = loadMeta();
  meta.knownCommands = [...state.player.knownCommands];
  meta.knownSpells = [...state.player.knownSpells];
  meta.scripts = { ...state.player.scripts };
  localStorage.setItem(KEY_META, JSON.stringify(meta));
}

// ── High Scores ───────────────────────────────────────────

/**
 * Record a high score into the meta object. Callers that also want to flush
 * other fields (knownCommands etc.) should call `recordHighScoreAndSaveMeta`
 * to avoid writing localStorage twice on the death path.
 */
export function recordHighScore(state, killedBy) {
  const meta = loadMeta();
  pushHighScore(meta, state, killedBy);
  localStorage.setItem(KEY_META, JSON.stringify(meta));
}

function pushHighScore(meta, state, killedBy) {
  const p = state.player;
  meta.highScores.push({
    depth: state.depth,
    turns: state.turn,
    killedBy: killedBy || 'unknown',
    date: new Date().toISOString().slice(0, 10),
    stats: {
      hp: p.hp, maxHp: p.maxHp,
      mp: p.mp, maxMp: p.maxMp,
      atk: p.atk, def: p.def,
      spd: p.spd, rng: p.rng, int: p.int,
      level: p.level || 1,
    },
    inventory: p.inventory.map(i => itemName(i)),
    knownSpells: [...p.knownSpells],
  });
  // Keep last 20 scores
  if (meta.highScores.length > 20) {
    meta.highScores = meta.highScores.slice(-20);
  }
}

/**
 * Death-path shortcut: record the high score and flush the player's
 * meta-progression (knownCommands/spells/scripts) in a single write. The
 * old pattern of `recordHighScore(...); saveMeta(state)` touched
 * localStorage twice back-to-back.
 */
export function recordHighScoreAndSaveMeta(state, killedBy) {
  const meta = loadMeta();
  pushHighScore(meta, state, killedBy);
  meta.knownCommands = [...state.player.knownCommands];
  meta.knownSpells = [...state.player.knownSpells];
  meta.scripts = { ...state.player.scripts };
  localStorage.setItem(KEY_META, JSON.stringify(meta));
}

export function getHighScores() {
  return loadMeta().highScores;
}

// ── Run Checkpoint (deleted on death) ─────────────────────

export function saveRun(state) {
  const p = state.player;
  const run = {
    version: SAVE_VERSION,
    depth: state.depth,
    turn: state.turn,
    tick: state.tick ?? 0,
    player: {
      hp: p.hp, maxHp: p.maxHp,
      mp: p.mp, maxMp: p.maxMp,
      atk: p.atk, def: p.def,
      spd: p.spd, rng: p.rng, int: p.int,
      level: p.level || 1,
      energy: p.energy ?? 10,
      fovRadius: p.fovRadius,
      faction: p.faction || 'player',
      // Summoning lifecycle — always null for the player (they have no
      // summoner themselves), but persisted for schema symmetry with
      // monster instances and for defensive round-tripping.
      ownerId: p.ownerId ?? null,
      duration: p.duration ?? null,
      inventory: p.inventory.map(i => ({ ...i })),
      statuses: p.statuses.map(s => ({ ...s })),
      resistances: { ...(p.resistances || {}) },
      equipment: { ...(p.equipment || {}) },
      knownCommands: [...p.knownCommands],
      knownSpells: [...p.knownSpells],
      scripts: { ...p.scripts },
      lastAttacker: p.lastAttacker ?? null,
      // memory is JSON-safe by contract (see `set` / help hooks) — round-tripping
      // through JSON drops functions/Maps/etc. automatically if someone stores
      // them by mistake.
      memory: JSON.parse(JSON.stringify(p.memory || {})),
    },
    nextMonsterId: state.nextMonsterId,
    nextItemId: state.nextItemId,
    nextCloudId: state.nextCloudId ?? 1,
    // Clouds are tied to a specific floor which is regenerated on reload —
    // so we intentionally drop them here. Persisting the counter keeps IDs
    // monotonic across sessions.
    clouds: [],
  };
  localStorage.setItem(KEY_RUN, JSON.stringify(run));
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(KEY_RUN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) {
      deleteRun();
      return null;
    }
    return data;
  } catch {
    deleteRun();
    return null;
  }
}

export function deleteRun() {
  localStorage.removeItem(KEY_RUN);
}

export function deleteMeta() {
  localStorage.removeItem(KEY_META);
}
