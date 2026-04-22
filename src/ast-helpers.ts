// Readable AST constructors for tests and the demo.

import type {
  Stmt, Expr, Literal, Ident, Call, Index, Member, BinOp, UnaryOp, ArrayLit,
  ExprStmt, Assign, If, While, For, FuncDef, Return, Block, EventHandler,
  BinOpKind, UnaryOpKind, Script,
} from "./types.js";

export const lit = (value: number | string | boolean | null): Literal => ({ t: "Literal", value });
export const ident = (name: string): Ident => ({ t: "Ident", name });
export const call = (callee: Expr | string, ...args: Expr[]): Call => ({
  t: "Call",
  callee: typeof callee === "string" ? ident(callee) : callee,
  args,
});
export const index = (obj: Expr, key: Expr): Index => ({ t: "Index", obj, key });
export const member = (obj: Expr, name: string): Member => ({ t: "Member", obj, name });
export const bin = (op: BinOpKind, a: Expr, b: Expr): BinOp => ({ t: "BinOp", op, a, b });
export const un = (op: UnaryOpKind, a: Expr): UnaryOp => ({ t: "UnaryOp", op, a });
export const arr = (...items: Expr[]): ArrayLit => ({ t: "ArrayLit", items });

export const exprStmt = (expr: Expr): ExprStmt => ({ t: "ExprStmt", expr });
export const assign = (target: Ident | Index | Member, value: Expr): Assign => ({
  t: "Assign", target, value,
});
export const if_ = (cond: Expr, then: Stmt[], else_?: Stmt[]): If =>
  else_ ? { t: "If", cond, then, else: else_ } : { t: "If", cond, then };
export const while_ = (cond: Expr, body: Stmt[]): While => ({ t: "While", cond, body });
export const for_ = (name: string, iter: Expr, body: Stmt[]): For => ({ t: "For", name, iter, body });
export const funcDef = (name: string, params: string[], body: Stmt[]): FuncDef => ({
  t: "FuncDef", name, params, body,
});
export const ret = (value?: Expr): Return => value !== undefined ? { t: "Return", value } : { t: "Return" };
export const block = (body: Stmt[]): Block => ({ t: "Block", body });
export const onEvent = (event: string, body: Stmt[], binding?: string): EventHandler =>
  binding ? { t: "EventHandler", event, binding, body } : { t: "EventHandler", event, body };

// Convenience: build a Script from a flat list of top-level statements.
export function script(...stmts: (Stmt | EventHandler | FuncDef)[]): Script {
  const main: Stmt[] = [];
  const handlers: EventHandler[] = [];
  const funcs: FuncDef[] = [];
  for (const s of stmts) {
    if (s.t === "EventHandler") handlers.push(s);
    else if (s.t === "FuncDef") funcs.push(s);
    else main.push(s);
  }
  return { main, handlers, funcs };
}

// Shorthands for common command calls.
export const cApproach = (target: Expr) => exprStmt(call("approach", target));
export const cFlee = (target: Expr) => exprStmt(call("flee", target));
export const cAttack = (target: Expr) => exprStmt(call("attack", target));
export const cCast = (spell: string, target: Expr) => exprStmt(call("cast", lit(spell), target));
export const cWait = () => exprStmt(call("wait"));
export const cExit = (door: string) => exprStmt(call("exit", lit(door)));
export const cHalt = () => exprStmt(call("halt"));
