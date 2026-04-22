// Monster knowledge catalog — persistent meta-progression store.
//
// Reveal tiers for each monster type:
//   none     — default. `inspect` shows only a placeholder name + hp bar.
//   partial  — stats, resistances, inventory. Script still hidden.
//   full     — everything, including AI script.
//
// Tier transitions:
//   noteSeen     creates a 'none' entry on first sight.
//   noteDamage   bumps a 'none' entry to 'partial' (player was hit).
//   noteKill     bumps a 'none' entry to 'partial' and increments kills.
//   reveal       jumps straight to 'full' (book use / sudo).
//
// Backing store is localStorage under its own key (independent of the per-run
// save and the meta save, so catalog survives save-version bumps).
//
// All reads/writes go through a module-level singleton that is lazy-loaded
// once and re-persisted whenever a write would actually change state — keeps
// hot paths (every visibility update, every damage event) cheap.

const STORAGE_KEY = 'commandDungeon_catalog';
const VERSION = 1;

const TIER_ORDER = { none: 0, partial: 1, full: 2 };

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.version === VERSION && data.entries && typeof data.entries === 'object') {
        cache = data;
        return cache;
      }
    }
  } catch {
    // fall through to default
  }
  cache = { version: VERSION, entries: {} };
  return cache;
}

function persist() {
  if (!cache) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    }
  } catch {
    // storage full / disabled — silent no-op.
  }
}

function ensureEntry(type, depth) {
  const store = load();
  let entry = store.entries[type];
  if (!entry) {
    entry = { revealed: 'none', firstSeenDepth: depth ?? null, kills: 0 };
    store.entries[type] = entry;
    return { entry, changed: true };
  }
  return { entry, changed: false };
}

function bumpTo(type, tier, depth) {
  const { entry, changed } = ensureEntry(type, depth);
  let didChange = changed;
  if (TIER_ORDER[tier] > TIER_ORDER[entry.revealed]) {
    entry.revealed = tier;
    didChange = true;
  }
  return { entry, changed: didChange };
}

/** First-sight registration. Creates a 'none' entry if one doesn't exist. */
export function noteSeen(type, depth) {
  if (!type) return;
  const { changed } = ensureEntry(type, depth);
  if (changed) persist();
}

/** Player took damage from `type` — minimum reveal is 'partial'. */
export function noteDamage(type, depth) {
  if (!type) return;
  const { changed } = bumpTo(type, 'partial', depth);
  if (changed) persist();
}

/** Player killed an instance of `type` — minimum reveal is 'partial'. */
export function noteKill(type, depth) {
  if (!type) return;
  const { entry, changed } = bumpTo(type, 'partial', depth);
  entry.kills = (entry.kills || 0) + 1;
  if (changed || true) persist();
}

/** Book / sudo-driven full reveal. */
export function reveal(type, depth) {
  if (!type) return false;
  const { changed } = bumpTo(type, 'full', depth);
  if (changed) persist();
  return true;
}

/** Reveal tier for `type` — always a string in TIER_ORDER. */
export function tierOf(type) {
  const entry = load().entries[type];
  return entry ? entry.revealed : 'none';
}

export function getEntry(type) {
  return load().entries[type] || null;
}

export function getAllEntries() {
  return { ...load().entries };
}

/** Test helper — wipes the in-memory + persisted catalog. */
export function resetCatalog() {
  cache = { version: VERSION, entries: {} };
  persist();
}
