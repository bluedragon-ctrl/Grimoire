// Helpers shared by help-test suites. Walk every code-bearing field on
// every help entry and produce a flat list of {path, kind, code} records.
//
// "Code-bearing" means: the entry's examples[] array, plus every fenced
// ``` block inside the entry's body string. Fenced blocks inside body
// have historically been written by hand and weren't covered by the
// parse-test before Phase 13.6 — that's the regression this catches.

import { allEntries } from "../../../src/ui/help/index.js";

export type SnippetKind = "example" | "body";
export interface Snippet {
  path: string;
  kind: SnippetKind;
  /** 0-based ordinal of the snippet within {kind} for this path. */
  index: number;
  code: string;
}

/**
 * Pull every fenced ``` ... ``` block out of a body string. Blocks tagged
 * with a language other than `dsl` (e.g. ```text for an ASCII diagram) are
 * ignored — the parse-test only walks DSL snippets. Untagged fences are
 * treated as DSL by default to match the renderer (see help-pane:renderBody).
 */
export function extractFencedBlocks(body: string): string[] {
  const blocks: string[] = [];
  const re = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)\n?```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = (m[1] ?? "").toLowerCase();
    if (tag !== "" && tag !== "dsl" && tag !== "grim") continue;
    blocks.push(m[2] ?? "");
  }
  return blocks;
}

/** Yield every code snippet referenced by the help tree. */
export function collectSnippets(): Snippet[] {
  const out: Snippet[] = [];
  for (const e of allEntries()) {
    e.examples.forEach((ex, i) => {
      out.push({ path: e.path, kind: "example", index: i, code: ex.code });
    });
    if (e.body) {
      extractFencedBlocks(e.body).forEach((code, i) => {
        out.push({ path: e.path, kind: "body", index: i, code });
      });
    }
  }
  return out;
}

/**
 * Heuristic: a snippet is "self-contained enough to execute under a stub
 * world" when it's short and avoids constructs that depend on specific room
 * shape (multiple enemies, doors, items). Snippets that fail this filter
 * still get parse-validated; they just aren't run.
 */
export function isExecutable(code: string): boolean {
  const lines = code.split("\n").filter(l => l.trim().length > 0);
  if (lines.length > 12) return false;
  // Anything that depends on specific items/doors/inventory state is hard
  // to set up in a stub. Skip them.
  if (/\b(items|doors|chests|objects|use\(|pickup|drop|exit|summon|cast)\b/.test(code)) return false;
  if (/\bon\s+(hit|see)\b/.test(code)) return false;
  // Indexing into queries that return null when empty (`enemies()[0]`) is
  // fine when we seed at least one enemy in the stub world; the runner does
  // exactly that. Allow.
  return true;
}
