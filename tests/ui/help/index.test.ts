// Help aggregator coverage: every category resolves, no duplicates, every
// `related` path exists, and every engine-registry entry shows up in the
// catalog (even when the def has no `help?` — auto-generation fills it in).

import { describe, it, expect } from "vitest";
import {
  allEntries, categories, entriesIn, getEntry, search,
} from "../../../src/ui/help/index.js";
import { SPELLS } from "../../../src/content/spells.js";
import { ITEMS } from "../../../src/content/items.js";
import { MONSTER_TEMPLATES } from "../../../src/content/monsters.js";
import { COMMAND_HELP } from "../../../src/ui/help/commands.js";
import { QUERY_HELP } from "../../../src/ui/help/queries.js";
import { queries as RUNTIME_QUERIES } from "../../../src/commands.js";

describe("help tree", () => {
  it("every category has at least one entry", () => {
    for (const c of categories()) {
      expect(entriesIn(c.id).length, `${c.id} should have entries`).toBeGreaterThan(0);
    }
  });

  it("all entries have a non-empty blurb", () => {
    for (const e of allEntries()) {
      expect(e.blurb, `${e.path} blurb`).toBeTruthy();
      expect(e.blurb.length).toBeGreaterThan(0);
    }
  });

  it("paths are unique", () => {
    const paths = allEntries().map(e => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every related path resolves to a real entry", () => {
    for (const e of allEntries()) {
      for (const p of e.related) {
        expect(getEntry(p), `${e.path} → related ${p}`).not.toBeNull();
      }
    }
  });
});

describe("generated catalogs", () => {
  it("every spell appears", () => {
    for (const name of Object.keys(SPELLS)) {
      expect(getEntry(`spells/${name}`), `spells/${name}`).not.toBeNull();
    }
  });

  it("every item appears", () => {
    for (const id of Object.keys(ITEMS)) {
      expect(getEntry(`items/${id}`), `items/${id}`).not.toBeNull();
    }
  });

  it("every monster template appears", () => {
    for (const id of Object.keys(MONSTER_TEMPLATES)) {
      expect(getEntry(`monsters/${id}`), `monsters/${id}`).not.toBeNull();
    }
  });
});

describe("command & query coverage", () => {
  it("every command in COMMAND_HELP resolves", () => {
    for (const id of Object.keys(COMMAND_HELP)) {
      expect(getEntry(`commands/${id}`), `commands/${id}`).not.toBeNull();
    }
  });

  it("every runtime query has a help page", () => {
    for (const name of Object.keys(RUNTIME_QUERIES)) {
      expect(QUERY_HELP[name], `QUERY_HELP for ${name}`).toBeDefined();
      expect(getEntry(`queries/${name}`), `queries/${name}`).not.toBeNull();
    }
  });
});

describe("search", () => {
  it("finds by name substring", () => {
    const hits = search("approach");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.entry.path).toBe("commands/approach");
  });

  it("empty query returns nothing", () => {
    expect(search("")).toEqual([]);
    expect(search("  ")).toEqual([]);
  });

  it("name hits rank above blurb hits", () => {
    const hits = search("cast");
    const idxName = hits.findIndex(h => h.tier === "name");
    const idxBlurb = hits.findIndex(h => h.tier === "blurb");
    if (idxName !== -1 && idxBlurb !== -1) {
      expect(idxName).toBeLessThan(idxBlurb);
    }
  });
});
