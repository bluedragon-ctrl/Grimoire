// Snapshot the DSL surface — actor methods, collection methods, builtins,
// keywords, events — and assert each token shows up in the help tree.
//
// "Shows up" means: either there's a leaf at the canonical path
// (commands/cast, queries/enemies, events/hit, etc.) OR the name appears
// inside the body or an example of the data/* page that documents the
// shape it's defined on. This catches the gap where 13.5 added a method
// like `min_by` that the language supports but no help page mentions.
//
// If you legitimately add a new actor method or builtin, list it here
// and add prose for it in the relevant page — the test will tell you
// where it's missing.

import { describe, it, expect } from "vitest";
import { allEntries, getEntry } from "../../../src/ui/help/index.js";

const ACTOR_METHODS = [
  "distance_to", "adjacent_to", "in_los",
  "has_effect", "effect_remaining", "effect_magnitude", "list_effects",
  "can_cast",
];

const ACTOR_FIELDS = [
  "id", "kind", "pos", "hp", "maxHp", "mp", "maxMp",
  "atk", "def", "int", "alive", "is_hero", "is_summoned", "summoner",
];

const COLLECTION_METHODS = [
  "filter", "sorted_by", "first", "last", "min_by", "max_by", "length",
];

const BUILTINS = ["len", "min", "max"];

const KEYWORDS = [
  "if", "elif", "else", "while", "for", "def", "lambda",
  "break", "continue", "pass", "and", "or", "not", "return",
];

const EVENTS = ["hit", "see"];

function pageMentions(path: string, needle: string): boolean {
  const e = getEntry(path);
  if (!e) return false;
  const haystack =
    (e.body ?? "") + "\n" +
    e.examples.map(x => x.code).join("\n");
  // Match the bare token to avoid `min` matching `admin`. Word-boundary
  // around the needle does the right thing for snake_case identifiers
  // since `_` is a word character in JS regex.
  const re = new RegExp(`\\b${needle}\\b`);
  return re.test(haystack);
}

describe("help coverage — DSL surface", () => {
  it("every actor method is mentioned on data/actor", () => {
    for (const m of ACTOR_METHODS) {
      expect(pageMentions("data/actor", m), `data/actor should mention ${m}`).toBe(true);
    }
  });

  it("every actor field is mentioned on data/actor", () => {
    for (const f of ACTOR_FIELDS) {
      expect(pageMentions("data/actor", f), `data/actor should mention ${f}`).toBe(true);
    }
  });

  it("every Collection method is mentioned on data/collection", () => {
    for (const m of COLLECTION_METHODS) {
      expect(pageMentions("data/collection", m), `data/collection should mention ${m}`).toBe(true);
    }
  });

  it("every builtin is mentioned in the language primer", () => {
    for (const b of BUILTINS) {
      expect(pageMentions("language/overview", b), `language/overview should mention ${b}`).toBe(true);
    }
  });

  it("every keyword is mentioned in the language primer", () => {
    for (const k of KEYWORDS) {
      expect(pageMentions("language/overview", k), `language/overview should mention ${k}`).toBe(true);
    }
  });

  it("every event has a leaf page", () => {
    for (const ev of EVENTS) {
      expect(getEntry(`events/${ev}`), `events/${ev}`).not.toBeNull();
    }
    expect(getEntry("events/registry"), "events/registry").not.toBeNull();
  });
});

describe("help coverage — no orphans", () => {
  // Catalog categories (spells/items/monsters) are reached by browsing
  // their list, not by cross-references — exempt them. Same for examples,
  // which are leaves rather than waypoints. The check only matters for
  // hand-authored data/queries/commands/events pages.
  const REQUIRES_INCOMING = new Set(["data", "queries", "commands", "events"]);

  it("every primary page has at least one incoming related[] link", () => {
    const reachable = new Set<string>();
    for (const e of allEntries()) {
      for (const p of e.related) reachable.add(p);
    }
    const orphans: string[] = [];
    for (const e of allEntries()) {
      if (!REQUIRES_INCOMING.has(e.category)) continue;
      if (!reachable.has(e.path)) orphans.push(e.path);
    }
    expect(orphans, `orphan pages with no incoming links: ${orphans.join(", ")}`).toEqual([]);
  });
});
