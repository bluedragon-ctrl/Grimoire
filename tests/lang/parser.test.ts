import { describe, it, expect } from "vitest";
import { parse } from "../../src/lang/index.js";
import type { Stmt, Script } from "../../src/types.js";

// Strip `loc` from a tree for structural comparison (loc is tested
// separately). Everything else is still present.
function stripLoc<T>(x: T): T {
  if (Array.isArray(x)) return x.map(stripLoc) as any;
  if (x && typeof x === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === "loc") continue;
      out[k] = stripLoc(v);
    }
    return out;
  }
  return x;
}

function parseMain(src: string): Stmt[] {
  return stripLoc(parse(src).main);
}

function parseScript(src: string): Script {
  return stripLoc(parse(src));
}

describe("parser", () => {
  it("1. assignment", () => {
    expect(parseMain("x = 1\n")).toMatchObject([
      { t: "Assign", target: { t: "Ident", name: "x" }, value: { t: "Literal", value: 1 } },
    ]);
  });

  it("2. if/then", () => {
    expect(parseMain("if x:\n  y = 1\n")).toMatchObject([
      { t: "If",
        cond: { t: "Ident", name: "x" },
        then: [{ t: "Assign" }] },
    ]);
  });

  it("3. if/elif/else", () => {
    const ast = parseMain("if a:\n  x\nelif b:\n  y\nelse:\n  z\n");
    expect(ast[0]).toMatchObject({
      t: "If",
      cond: { t: "Ident", name: "a" },
      then: [{ t: "ExprStmt", expr: { t: "Ident", name: "x" } }],
      else: [
        { t: "If",
          cond: { t: "Ident", name: "b" },
          then: [{ t: "ExprStmt", expr: { t: "Ident", name: "y" } }],
          else: [{ t: "ExprStmt", expr: { t: "Ident", name: "z" } }] },
      ],
    });
  });

  it("4. while loop", () => {
    expect(parseMain("while x:\n  y\n")).toMatchObject([
      { t: "While", cond: { t: "Ident", name: "x" },
        body: [{ t: "ExprStmt", expr: { t: "Ident", name: "y" } }] },
    ]);
  });

  it("5. for-in loop", () => {
    expect(parseMain("for e in enemies():\n  attack(e)\n")).toMatchObject([
      { t: "For", name: "e",
        iter: { t: "Call", callee: { t: "Ident", name: "enemies" }, args: [] },
        body: [{ t: "ExprStmt",
                 expr: { t: "Call",
                         callee: { t: "Ident", name: "attack" },
                         args: [{ t: "Ident", name: "e" }] } }] },
    ]);
  });

  it("6. and/or/not", () => {
    expect(parseMain("x = a and b or not c\n")).toMatchObject([
      { t: "Assign",
        value: {
          t: "BinOp", op: "||",
          a: { t: "BinOp", op: "&&",
               a: { t: "Ident", name: "a" },
               b: { t: "Ident", name: "b" } },
          b: { t: "UnaryOp", op: "!", a: { t: "Ident", name: "c" } },
        } },
    ]);
  });

  it("7. comparison", () => {
    expect(parseMain("x = a <= b\n")).toMatchObject([
      { t: "Assign",
        value: { t: "BinOp", op: "<=",
                 a: { t: "Ident", name: "a" }, b: { t: "Ident", name: "b" } } },
    ]);
  });

  it("8. arithmetic precedence: 1 + 2 * 3", () => {
    expect(parseMain("x = 1 + 2 * 3\n")).toMatchObject([
      { t: "Assign",
        value: { t: "BinOp", op: "+",
                 a: { t: "Literal", value: 1 },
                 b: { t: "BinOp", op: "*",
                      a: { t: "Literal", value: 2 },
                      b: { t: "Literal", value: 3 } } } },
    ]);
  });

  it("9. array literal", () => {
    expect(parseMain("x = [1, 2, 3]\n")).toMatchObject([
      { t: "Assign",
        value: { t: "ArrayLit",
                 items: [{ value: 1 }, { value: 2 }, { value: 3 }] } },
    ]);
  });

  it("10. indexing", () => {
    expect(parseMain("x = xs[0]\n")).toMatchObject([
      { t: "Assign",
        value: { t: "Index",
                 obj: { t: "Ident", name: "xs" },
                 key: { t: "Literal", value: 0 } } },
    ]);
  });

  it("11. member access", () => {
    expect(parseMain("x = me.hp\n")).toMatchObject([
      { t: "Assign",
        value: { t: "Member",
                 obj: { t: "Ident", name: "me" }, name: "hp" } },
    ]);
  });

  it("12. call with args", () => {
    expect(parseMain("attack(enemies()[0])\n")).toMatchObject([
      { t: "ExprStmt",
        expr: { t: "Call",
                callee: { t: "Ident", name: "attack" },
                args: [{ t: "Index",
                         obj: { t: "Call", callee: { t: "Ident", name: "enemies" } },
                         key: { t: "Literal", value: 0 } }] } },
    ]);
  });

  it("13. nested call", () => {
    expect(parseMain("cast(\"heal\", me)\n")).toMatchObject([
      { t: "ExprStmt",
        expr: { t: "Call",
                callee: { t: "Ident", name: "cast" },
                args: [{ t: "Literal", value: "heal" },
                       { t: "Ident", name: "me" }] } },
    ]);
  });

  it("14. `on hit:` handler", () => {
    const script = parseScript("on hit:\n  halt\n");
    expect(script.handlers).toMatchObject([
      { t: "EventHandler", event: "hit",
        body: [{ t: "ExprStmt",
                 expr: { t: "Call", callee: { t: "Ident", name: "halt" } } }] },
    ]);
    expect(script.handlers[0]!.binding).toBeUndefined();
  });

  it("15. `on hit as attacker:` handler", () => {
    const script = parseScript("on hit as attacker:\n  attack(attacker)\n");
    expect(script.handlers).toMatchObject([
      { t: "EventHandler", event: "hit", binding: "attacker",
        body: [{ t: "ExprStmt",
                 expr: { t: "Call", callee: { t: "Ident", name: "attack" },
                         args: [{ t: "Ident", name: "attacker" }] } }] },
    ]);
  });

  it("16. nested blocks", () => {
    expect(parseMain("if a:\n  if b:\n    x\n")).toMatchObject([
      { t: "If",
        then: [{ t: "If",
                 then: [{ t: "ExprStmt", expr: { t: "Ident", name: "x" } }] }] },
    ]);
  });

  it("17. halt statement", () => {
    expect(parseMain("halt\n")).toMatchObject([
      { t: "ExprStmt",
        expr: { t: "Call", callee: { t: "Ident", name: "halt" }, args: [] } },
    ]);
  });

  it("loc span is attached to every node", () => {
    const s = parse("x = 1\n");
    const assign = s.main[0]!;
    expect(assign.loc?.start).toEqual({ line: 1, col: 1 });
    expect(assign.loc?.end.line).toBe(1);
    expect((assign as any).value.loc?.start).toEqual({ line: 1, col: 5 });
  });
});
