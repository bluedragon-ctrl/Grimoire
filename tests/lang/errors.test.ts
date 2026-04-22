import { describe, it, expect } from "vitest";
import { parse } from "../../src/lang/index.js";
import { ParseError, formatError, didYouMean } from "../../src/lang/errors.js";

function errOf(src: string): ParseError {
  try { parse(src); } catch (e) { if (e instanceof ParseError) return e; throw e; }
  throw new Error("expected ParseError");
}

describe("parse errors", () => {
  it("unclosed paren", () => {
    const e = errOf("x = (1 + 2\n");
    expect(e.message).toMatch(/\)/);
    expect(e.line).toBe(1);
  });

  it("bad dedent (3 spaces under 4-space block)", () => {
    const src = [
      "if a:",
      "    x",
      "   y",   // 3 spaces — doesn't match 4 or 0
    ].join("\n");
    const e = errOf(src);
    expect(e.line).toBe(3);
    expect(e.message).toMatch(/indent/i);
  });

  it("typo 'whille' suggests 'while'", () => {
    const e = errOf("whille x:\n  y\n");
    expect(e.hint ?? "").toMatch(/while/);
  });

  it("if missing colon", () => {
    const e = errOf("if x\n  y\n");
    expect(e.message).toMatch(/:/);
  });

  it("for missing 'in'", () => {
    const e = errOf("for x:\n  y\n");
    expect(e.message).toMatch(/in/i);
  });

  it("'on:' missing event name", () => {
    const e = errOf("on:\n  x\n");
    expect(e.message).toMatch(/event/i);
  });

  it("unterminated string", () => {
    const e = errOf('x = "hello\n');
    expect(e.message).toMatch(/string/i);
  });

  it("empty block under 'if x:'", () => {
    const e = errOf("if x:\n");
    expect(e.message).toMatch(/indent|block|body/i);
  });

  it("stray ')' at top level", () => {
    const e = errOf(")\n");
    expect(e.line).toBe(1);
  });

  it("typo 'enimies' suggests 'enemies'", () => {
    expect(didYouMean("enimies")).toBe("enemies");
  });

  it("formatError renders caret under the column", () => {
    const err = new ParseError(2, 5, "oops", "try again");
    const formatted = formatError("line one\nabcdefg", err);
    expect(formatted).toContain("abcdefg");
    expect(formatted).toContain("    ^");
    expect(formatted).toContain("hint: try again");
  });
});
