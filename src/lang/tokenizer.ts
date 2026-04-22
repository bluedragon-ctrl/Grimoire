// Python-ish tokenizer with CPython-style INDENT/DEDENT.
//
// Logical-line model: blank lines and comment-only lines do not emit
// NEWLINE and do not affect the indent stack. On each real line we compare
// leading-whitespace column to the top of the indent stack and emit
// INDENT (push) or one+ DEDENTs (pop).

import { ParseError } from "./errors.js";

export type TokenKind =
  | "NEWLINE" | "INDENT" | "DEDENT"
  | "NAME" | "NUMBER" | "STRING" | "KEYWORD" | "OP" | "EOF";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;   // 1-based
  col: number;    // 1-based, column of first char
}

const KEYWORDS = new Set([
  "if", "elif", "else", "while", "for", "in",
  "and", "or", "not",
  "true", "false", "halt", "on", "as", "me", "return",
]);

// Two-char operators must be checked before their one-char prefixes.
const TWO_CHAR_OPS = ["==", "!=", "<=", ">="];
const ONE_CHAR_OPS = new Set([
  "+", "-", "*", "/", "%", "=", "<", ">",
  "(", ")", "[", "]", ",", ":", ".",
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const indentStack: number[] = [0];

  // Normalize line endings.
  const src = source.replace(/\r\n?/g, "\n");
  const lines = src.split("\n");

  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li]!;
    const lineNo = li + 1;

    // Measure leading whitespace.
    let i = 0;
    let hasTab = false;
    let hasSpace = false;
    while (i < rawLine.length) {
      const c = rawLine[i];
      if (c === " ") { hasSpace = true; i++; }
      else if (c === "\t") { hasTab = true; i++; }
      else break;
    }
    const indentWidth = i;
    const rest = rawLine.slice(i);

    // Skip blank or comment-only lines (no NEWLINE, no indent change).
    if (rest.length === 0 || rest[0] === "#") continue;

    if (hasTab && hasSpace) {
      throw new ParseError(lineNo, 1, "I found both tabs and spaces in the indentation here — pick one and stick with it.");
    }

    // Indent / dedent.
    const top = indentStack[indentStack.length - 1]!;
    if (indentWidth > top) {
      indentStack.push(indentWidth);
      tokens.push({ kind: "INDENT", value: "", line: lineNo, col: 1 });
    } else if (indentWidth < top) {
      while (indentStack.length > 0 && indentStack[indentStack.length - 1]! > indentWidth) {
        indentStack.pop();
        tokens.push({ kind: "DEDENT", value: "", line: lineNo, col: 1 });
      }
      if (indentStack[indentStack.length - 1] !== indentWidth) {
        throw new ParseError(lineNo, 1,
          "This indentation doesn't line up with any block above it.",
          "Match the indent of an earlier line.");
      }
    }

    // Scan the rest of the line for tokens.
    scanLine(rest, lineNo, indentWidth + 1, tokens);

    // End-of-line NEWLINE.
    tokens.push({ kind: "NEWLINE", value: "\n", line: lineNo, col: rawLine.length + 1 });
  }

  // Flush any remaining dedents.
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push({ kind: "DEDENT", value: "", line: lines.length + 1, col: 1 });
  }
  tokens.push({ kind: "EOF", value: "", line: lines.length + 1, col: 1 });
  return tokens;
}

// ──────────────────────────── per-line scanner ────────────────────────────

function scanLine(rest: string, lineNo: number, startCol: number, out: Token[]): void {
  let j = 0;
  while (j < rest.length) {
    const c = rest[j]!;
    const col = startCol + j;

    // whitespace between tokens
    if (c === " " || c === "\t") { j++; continue; }

    // comment: rest of line
    if (c === "#") break;

    // string
    if (c === '"') {
      const { value, next } = readString(rest, j, lineNo, col);
      out.push({ kind: "STRING", value, line: lineNo, col });
      j = next;
      continue;
    }

    // number (integer)
    if (isDigit(c)) {
      let k = j + 1;
      while (k < rest.length && isDigit(rest[k]!)) k++;
      out.push({ kind: "NUMBER", value: rest.slice(j, k), line: lineNo, col });
      j = k;
      continue;
    }

    // identifier / keyword
    if (isIdentStart(c)) {
      let k = j + 1;
      while (k < rest.length && isIdentCont(rest[k]!)) k++;
      const name = rest.slice(j, k);
      out.push({
        kind: KEYWORDS.has(name) ? "KEYWORD" : "NAME",
        value: name, line: lineNo, col,
      });
      j = k;
      continue;
    }

    // two-char operator
    const two = rest.slice(j, j + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      out.push({ kind: "OP", value: two, line: lineNo, col });
      j += 2;
      continue;
    }

    // one-char operator
    if (ONE_CHAR_OPS.has(c)) {
      out.push({ kind: "OP", value: c, line: lineNo, col });
      j++;
      continue;
    }

    throw new ParseError(lineNo, col, `I don't recognize the character '${c}' here.`);
  }
}

function readString(src: string, start: number, lineNo: number, col: number): { value: string; next: number } {
  let j = start + 1;
  let out = "";
  while (j < src.length) {
    const c = src[j]!;
    if (c === '"') {
      return { value: out, next: j + 1 };
    }
    if (c === "\\") {
      const esc = src[j + 1];
      if (esc === undefined) break;
      if (esc === "n") out += "\n";
      else if (esc === "t") out += "\t";
      else if (esc === "\\") out += "\\";
      else if (esc === '"') out += '"';
      else throw new ParseError(lineNo, col + (j - start), `Unknown escape \\${esc} in a string.`);
      j += 2;
      continue;
    }
    out += c;
    j++;
  }
  throw new ParseError(lineNo, col, "This string never closes — add a matching \" at the end.");
}

function isDigit(c: string): boolean { return c >= "0" && c <= "9"; }
function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}
function isIdentCont(c: string): boolean { return isIdentStart(c) || isDigit(c); }
