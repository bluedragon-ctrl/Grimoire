// The key guarantee: every example snippet in every help entry must parse.
// If the DSL changes in a way that breaks an authored snippet, this test
// fires. Parse-only — execution is intentionally out of scope (snippets
// may reference game state that doesn't exist in a test world).

import { describe, it, expect } from "vitest";
import { allEntries } from "../../../src/ui/help/index.js";
import { parse } from "../../../src/lang/index.js";

describe("help examples parse", () => {
  for (const entry of allEntries()) {
    for (let i = 0; i < entry.examples.length; i++) {
      const code = entry.examples[i]!.code;
      it(`${entry.path}[${i}] parses`, () => {
        expect(() => parse(code)).not.toThrow();
      });
    }
  }
});
