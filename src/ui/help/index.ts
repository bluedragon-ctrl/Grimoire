// Help tree aggregator. Collects hand-authored registries (Commands, Queries,
// Data, Events, Examples), the scrolling Language page, and auto-generated
// catalogs (Spells, Items, Monsters) into a single flat map keyed by path.
// The UI consumes this — no engine code touches these structures.

import type { HelpEntry, HelpCategory, CategoryId } from "./types.js";
import { CATEGORIES } from "./types.js";
import { COMMAND_HELP } from "./commands.js";
import { QUERY_HELP } from "./queries.js";
import { DATA_PAGES } from "./data.js";
import { EVENT_PAGES } from "./events.js";
import { EXAMPLE_PAGES } from "./examples.js";
import { spellEntries, itemEntries, monsterEntries } from "./catalogs.js";
// Vite's ?raw import ships the file contents as a string. Used for the
// scrolling Language page — no markdown parser required.
import languageMd from "./pages/language.md?raw";

export type { HelpEntry, HelpCategory, CategoryId, HelpExample, HelpMeta } from "./types.js";
export { CATEGORIES } from "./types.js";

function wrap<T extends { id: string; examples: HelpEntry["examples"]; related?: string[]; signature?: string }>(
  category: CategoryId,
  src: Record<string, T>,
): HelpEntry[] {
  return Object.values(src).map(e => ({
    id: e.id,
    path: `${category}/${e.id}`,
    category,
    name: (e as any).name ?? e.id,
    blurb: (e as any).blurb ?? "",
    ...((e as any).signature ? { signature: (e as any).signature } : {}),
    ...((e as any).body ? { body: (e as any).body } : {}),
    examples: e.examples,
    related: e.related ?? [],
    ...((e as any).meta ? { meta: (e as any).meta } : {}),
  }));
}

function buildLanguageEntry(): HelpEntry {
  return {
    id: "overview",
    path: "language/overview",
    category: "language",
    name: "Language primer",
    blurb: "Indentation, control flow, assignment, comparisons, strings, handlers.",
    body: languageMd,
    examples: [],
    related: ["examples/melee", "commands/halt", "events/registry", "data/collection", "data/failure"],
  };
}

function buildAllEntries(): HelpEntry[] {
  return [
    buildLanguageEntry(),
    ...wrap("data",     DATA_PAGES),
    ...wrap("commands", COMMAND_HELP),
    ...wrap("queries",  QUERY_HELP),
    ...spellEntries(),
    ...itemEntries(),
    ...monsterEntries(),
    ...wrap("events",   EVENT_PAGES),
    ...wrap("examples", EXAMPLE_PAGES),
  ];
}

let CACHE: { byPath: Record<string, HelpEntry>; byCategory: Record<CategoryId, HelpEntry[]> } | null = null;

function build(): NonNullable<typeof CACHE> {
  const all = buildAllEntries();
  const byPath: Record<string, HelpEntry> = {};
  const byCategory: Record<CategoryId, HelpEntry[]> = {
    language: [], data: [], commands: [], queries: [],
    spells: [], items: [], monsters: [], events: [], examples: [],
  };
  for (const e of all) {
    if (byPath[e.path]) throw new Error(`Duplicate help path: ${e.path}`);
    byPath[e.path] = e;
    byCategory[e.category].push(e);
  }
  for (const arr of Object.values(byCategory)) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return { byPath, byCategory };
}

function tree(): NonNullable<typeof CACHE> {
  if (!CACHE) CACHE = build();
  return CACHE;
}

/** Look up a single leaf by path ("commands/cast"). */
export function getEntry(path: string): HelpEntry | null {
  return tree().byPath[path] ?? null;
}

/** All entries in a category, sorted by name. */
export function entriesIn(category: CategoryId): HelpEntry[] {
  return tree().byCategory[category].slice();
}

/** Every entry, flattened. Used by tests and search. */
export function allEntries(): HelpEntry[] {
  return Object.values(tree().byPath);
}

/** The category list for the top-level browse. */
export function categories(): readonly HelpCategory[] {
  return CATEGORIES;
}

// ──────────────────────────── search ────────────────────────────
// Simple fuzzy: substring match (case-insensitive) against name, then against
// blurb for a second-tier set. Results in the same tier sort by match index
// (earlier = better) then name.

export interface SearchHit {
  entry: HelpEntry;
  tier: "name" | "blurb";
}

export function search(q: string): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const nameHits: Array<{ entry: HelpEntry; idx: number }> = [];
  const blurbHits: Array<{ entry: HelpEntry; idx: number }> = [];
  for (const e of allEntries()) {
    const ni = e.name.toLowerCase().indexOf(needle);
    if (ni >= 0) { nameHits.push({ entry: e, idx: ni }); continue; }
    const bi = e.blurb.toLowerCase().indexOf(needle);
    if (bi >= 0) blurbHits.push({ entry: e, idx: bi });
  }
  nameHits.sort((a, b) => a.idx - b.idx || a.entry.name.localeCompare(b.entry.name));
  blurbHits.sort((a, b) => a.idx - b.idx || a.entry.name.localeCompare(b.entry.name));
  return [
    ...nameHits.map(h => ({ entry: h.entry, tier: "name" as const })),
    ...blurbHits.map(h => ({ entry: h.entry, tier: "blurb" as const })),
  ];
}
