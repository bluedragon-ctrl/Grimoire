import { describe, it, expect } from "vitest";
import { parseItemScript } from "../../src/items/script.js";
import { ParseError } from "../../src/lang/errors.js";

describe("item-script parser", () => {
  it("parses apply", () => {
    const ops = parseItemScript("x", "apply regen 30");
    expect(ops).toEqual([{ op: "apply", effectId: "regen", duration: 30 }]);
  });
  it("parses restore hp and mp", () => {
    const ops = parseItemScript("x", "restore hp 5\nrestore mp 10");
    expect(ops).toEqual([
      { op: "restore", pool: "hp", amount: 5 },
      { op: "restore", pool: "mp", amount: 10 },
    ]);
  });
  it("parses cleanse", () => {
    expect(parseItemScript("x", "cleanse poison"))
      .toEqual([{ op: "cleanse", effectId: "poison" }]);
  });
  it("parses modify and merge", () => {
    const ops = parseItemScript("x", "modify atk 1\nmerge int 2");
    expect(ops).toEqual([
      { op: "modify", stat: "atk", amount: 1 },
      { op: "merge",  stat: "int", amount: 2 },
    ]);
  });
  it("parses on_hit inflict", () => {
    const ops = parseItemScript("x", "on_hit inflict poison $TARGET 20 $L");
    expect(ops).toEqual([{ op: "on_hit_inflict", effectId: "poison", duration: 20, level: 1 }]);
  });
  it("skips blanks and comments", () => {
    const ops = parseItemScript("x", "\n# comment\napply regen 10\n\n");
    expect(ops.length).toBe(1);
  });

  it("bad op → ParseError with item id and line#", () => {
    try {
      parseItemScript("health_potion", "apply regen 10\nfoo bar 3");
    } catch (e) {
      const pe = e as ParseError;
      expect(pe).toBeInstanceOf(ParseError);
      expect(pe.line).toBe(2);
      expect(pe.message).toContain("health_potion");
      expect(pe.message).toContain("unknown op 'foo'");
      return;
    }
    throw new Error("expected throw");
  });
  it("bad effect name", () => {
    expect(() => parseItemScript("x", "apply nope 10")).toThrow(/unknown effect 'nope'/);
  });
  it("non-integer duration", () => {
    expect(() => parseItemScript("x", "apply regen x")).toThrow(/must be an integer/);
  });
  it("on_hit wrong signature", () => {
    expect(() => parseItemScript("x", "on_hit inflict poison 20")).toThrow(/on_hit must be/);
  });
  it("bad restore pool", () => {
    expect(() => parseItemScript("x", "restore stamina 5")).toThrow(/pool must be hp\|mp/);
  });
});
