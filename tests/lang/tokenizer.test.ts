import { describe, it, expect } from "vitest";
import { tokenize, type Token } from "../../src/lang/tokenizer.js";

function kinds(src: string): string[] {
  return tokenize(src).map(t => t.kind);
}
function values(src: string): string[] {
  return tokenize(src).map(t => t.value);
}

describe("tokenizer", () => {
  it("nested INDENT/DEDENT three levels deep", () => {
    const src = [
      "if a:",
      "  if b:",
      "    if c:",
      "      x",
      "      y",
    ].join("\n");
    const k = kinds(src);
    // INDENT count should be 3 (after each `:` block opens one)
    expect(k.filter(x => x === "INDENT").length).toBe(3);
    // At EOF we flush all open indents as DEDENTs.
    expect(k.filter(x => x === "DEDENT").length).toBe(3);
  });

  it("blank lines and comments do not emit NEWLINE", () => {
    const src = [
      "x",
      "",
      "# a comment",
      "   # indented comment",
      "y",
    ].join("\n");
    const toks = tokenize(src);
    const newlines = toks.filter(t => t.kind === "NEWLINE");
    // one for each non-blank content line (x and y)
    expect(newlines.length).toBe(2);
  });

  it("string escapes decode", () => {
    const toks = tokenize('"a\\nb\\tc\\\\d\\"e"');
    const s = toks.find(t => t.kind === "STRING")!;
    expect(s.value).toBe('a\nb\tc\\d"e');
  });

  it("mixed tabs+spaces in indentation is an error with a clear message", () => {
    const src = "if a:\n \tx";      // one space then one tab
    expect(() => tokenize(src)).toThrowError(/tabs and spaces/);
  });

  it("exiting nested blocks emits multiple DEDENTs", () => {
    const src = [
      "if a:",
      "  if b:",
      "    x",
      "y",                         // back to column 0 → 2 DEDENTs
    ].join("\n");
    const k = kinds(src);
    // Find the 'y' token's index; the two DEDENTs should be right before it.
    const yIdx = tokenize(src).findIndex(t => t.kind === "NAME" && t.value === "y");
    expect(tokenize(src).slice(yIdx - 2, yIdx).map(t => t.kind))
      .toEqual(["DEDENT", "DEDENT"]);
  });

  it("operators tokenize greedily", () => {
    const v = values("a <= b == c != d >= e");
    expect(v).toEqual(["a", "<=", "b", "==", "c", "!=", "d", ">=", "e", "\n", ""]);
  });

  it("integer numbers (decimals are out of scope for MVP)", () => {
    const toks = tokenize("x = 42");
    const n = toks.find(t => t.kind === "NUMBER")!;
    expect(n.value).toBe("42");
    // Decimals deliberately rejected by the MVP grammar.
    expect(() => tokenize("x = 3.14")).not.toThrow(); // '.' tokenizes as OP
    const pieces = tokenize("x = 3.14").filter(t => t.kind !== "NEWLINE" && t.kind !== "EOF");
    expect(pieces.map(t => t.value)).toEqual(["x", "=", "3", ".", "14"]);
  });

  it("trailing newline + EOF are emitted", () => {
    const toks = tokenize("x\n");
    expect(toks[toks.length - 1]!.kind).toBe("EOF");
    expect(toks.filter(t => t.kind === "NEWLINE").length).toBe(1);
  });
});
