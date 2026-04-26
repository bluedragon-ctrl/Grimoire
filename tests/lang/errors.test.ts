import { describe, it, expect, vi } from "vitest";
import { parse } from "../../src/lang/index.js";
import { ParseError, formatError, didYouMean } from "../../src/lang/errors.js";
import { runRoom } from "../../src/engine.js";
import { queries } from "../../src/commands.js";
import type { Actor, Room } from "../../src/types.js";
import {
  script, funcDef, exprStmt, call, assign, ident, lit, cHalt,
} from "../../src/ast-helpers.js";

function mkRoom(): Room {
  return { w: 5, h: 5, doors: [], chests: [] };
}
function mkHero(scriptArg: ReturnType<typeof script>): Actor {
  return {
    id: "h", kind: "hero", isHero: true,
    hp: 10, maxHp: 10, speed: 10, energy: 0, alive: true,
    pos: { x: 0, y: 0 }, script: scriptArg,
    atk: 3, def: 0, int: 0,
  };
}

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

describe("DSL runtime errors", () => {
  it("user func with action in expression position → ScriptError in log, no crash", () => {
    // A function that contains attack() called as an expression value.
    // `x = my_attack(enemy)` — callUserFunc should throw DSLRuntimeError,
    // which the scheduler catches and converts to a ScriptError log entry.
    const hero = mkHero(script(
      // func my_attack(): attack(enemies()[0])
      funcDef("my_attack", [], [
        exprStmt(call("attack", call("enemies", ident("0")))),
      ]),
      // x = my_attack()  ← expression position
      assign(ident("x"), call("my_attack")),
      cHalt(),
    ));
    const { log } = runRoom({ room: mkRoom(), actors: [hero] }, { seed: 1, maxTicks: 20 });
    const errors = log.map(e => e.event).filter(e => e.type === "ScriptError");
    expect(errors.length).toBeGreaterThan(0);
    const err = errors[0] as { type: "ScriptError"; actor: string; message: string };
    expect(err.actor).toBe("h");
    expect(err.message).toMatch(/expression position/);
  });

  it("non-DSL JS error thrown from a query propagates out of runRoom", () => {
    // Temporarily replace enemies() so it throws a plain Error.
    // The scheduler must NOT swallow this — it should propagate.
    const orig = (queries as Record<string, unknown>)["enemies"];
    (queries as Record<string, unknown>)["enemies"] = () => { throw new Error("query_boom"); };
    try {
      const hero = mkHero(script(exprStmt(call("enemies")), cHalt()));
      expect(() => runRoom({ room: mkRoom(), actors: [hero] }, { seed: 1, maxTicks: 20 })).toThrow("query_boom");
    } finally {
      (queries as Record<string, unknown>)["enemies"] = orig;
    }
  });
});
