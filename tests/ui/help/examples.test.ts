// Every code snippet shipped by the help tree must parse cleanly.
//
// Two sources are walked here:
//   1. entry.examples[] — paste-ready snippets attached to each leaf.
//   2. fenced ``` blocks inside entry.body strings (incl. language.md).
//
// Before Phase 13.6 only (1) was checked, so stale examples could rot
// inside body prose without the test firing. This file is the
// load-bearing piece — keeping help in sync with the DSL.
//
// Execution is intentionally out of scope here; some snippets reference
// game state (a specific door, a stocked bag) a stub world can't supply.
// See execute.test.ts for the subset that does run.

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/lang/index.js";
import { collectSnippets } from "./helpers.js";

describe("help snippets parse", () => {
  for (const s of collectSnippets()) {
    it(`${s.path} [${s.kind} ${s.index}] parses`, () => {
      expect(() => parse(s.code)).not.toThrow();
    });
  }
});
