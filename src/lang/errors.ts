// Parse-time errors with position + optional hint + "did you mean?".

// Thrown by the interpreter when a DSL script violates a runtime constraint
// (e.g. calling an action-bearing function in expression position). The
// scheduler catches only this class and converts it to a ScriptError event;
// all other throws propagate out of runRoom so bugs in command impls are
// visible.
export class DSLRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DSLRuntimeError";
  }
}

export class ParseError extends Error {
  line: number;
  col: number;
  hint?: string;
  constructor(line: number, col: number, message: string, hint?: string) {
    super(message);
    this.name = "ParseError";
    this.line = line;
    this.col = col;
    if (hint !== undefined) this.hint = hint;
  }
}

export function formatError(source: string, err: ParseError): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const srcLine = lines[err.line - 1] ?? "";
  const caret = " ".repeat(Math.max(0, err.col - 1)) + "^";
  const parts = [
    `line ${err.line}, col ${err.col}: ${err.message}`,
    srcLine,
    caret,
  ];
  if (err.hint) parts.push(`hint: ${err.hint}`);
  return parts.join("\n");
}

// ──────────────────────────── did-you-mean ────────────────────────────

export const KNOWN_NAMES = [
  // keywords
  "if", "elif", "else", "while", "for", "in",
  "and", "or", "not",
  "true", "false", "halt", "on", "as", "me", "return",
  // builtins / actions
  "enemies", "items", "chests", "doors", "hp",
  "cast", "attack", "approach", "flee", "move", "wait", "exit", "halt",
  "heal", "bolt", "length",
  "at",
  "len", "min", "max",
  "mp", "atk", "def", "int",
  // Phase 13.5: Pythonic actor surface methods
  "distance_to", "adjacent_to", "in_los", "is_hero", "is_summoned", "summoner",
  "has_effect", "effect_remaining", "effect_magnitude", "list_effects", "can_cast",
  // Phase 6
  "clouds", "cloud_at", "max_mp", "known_spells",
  "firebolt", "chill", "bless", "firewall",
] as const;

export function didYouMean(name: string, candidates: readonly string[] = KNOWN_NAMES): string | null {
  let best: { name: string; d: number } | null = null;
  for (const cand of candidates) {
    const d = levenshtein(name, cand);
    if (d === 0) return null;
    if (d <= 2 && (best === null || d < best.d)) best = { name: cand, d };
  }
  return best ? best.name : null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,       // insertion
        prev[j]! + 1,           // deletion
        prev[j - 1]! + cost,    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl]!;
}
