// Generator-based evaluator over the full AST.
//
// A script compiles into a main generator; handler ASTs compile into
// handler-generator factories. Both yield PendingAction values at command
// sites. Expressions evaluate synchronously (queries, math, member access,
// user-function calls via inline recursion).

import type {
  Script, Stmt, Expr, PendingAction, Actor, World, EventHandler, FuncDef, Direction,
} from "./types.js";
import { COST, queries } from "./commands.js";

// Command names that, when used at statement level, yield a PendingAction.
const COMMAND_NAMES = new Set([
  "approach", "flee", "attack", "cast", "wait", "exit", "halt",
]);

// ──────────────────────────── environment ────────────────────────────

interface Env {
  vars: Map<string, unknown>;
  parent: Env | null;
  funcs: Map<string, FuncDef>;
}

function makeEnv(parent: Env | null, funcs?: Map<string, FuncDef>): Env {
  return { vars: new Map(), parent, funcs: funcs ?? parent?.funcs ?? new Map() };
}

function envGet(env: Env, name: string): unknown {
  let e: Env | null = env;
  while (e) {
    if (e.vars.has(name)) return e.vars.get(name);
    e = e.parent;
  }
  return undefined;
}

function envSet(env: Env, name: string, value: unknown): void {
  // Assignment walks up to existing binding; otherwise creates local.
  let e: Env | null = env;
  while (e) {
    if (e.vars.has(name)) { e.vars.set(name, value); return; }
    e = e.parent;
  }
  env.vars.set(name, value);
}

// ──────────────────────────── interpreter context ────────────────────────────

export interface InterpCtx {
  world: World;
  self: Actor;
}

// ──────────────────────────── public API ────────────────────────────

export interface CompiledScript {
  makeMain(): Generator<PendingAction, void, void>;
  handlerFor(event: string): EventHandler | undefined;
  makeHandler(h: EventHandler, eventValue: unknown): Generator<PendingAction, void, void>;
}

export function compile(script: Script, ctx: InterpCtx): CompiledScript {
  const funcs = new Map<string, FuncDef>();
  for (const f of script.funcs) funcs.set(f.name, f);

  const makeMain = (): Generator<PendingAction, void, void> => {
    const env = makeEnv(null, funcs);
    return execStmts(script.main, env, ctx);
  };

  const handlerFor = (event: string) => script.handlers.find(h => h.event === event);

  const makeHandler = (h: EventHandler, eventValue: unknown) => {
    const env = makeEnv(null, funcs);
    if (h.binding) env.vars.set(h.binding, eventValue);
    return execStmts(h.body, env, ctx);
  };

  return { makeMain, handlerFor, makeHandler };
}

// ──────────────────────────── statement exec (generator) ────────────────────────────

function* execStmts(stmts: Stmt[], env: Env, ctx: InterpCtx): Generator<PendingAction, void, void> {
  for (const s of stmts) {
    yield* execStmt(s, env, ctx);
  }
}

function* execStmt(s: Stmt, env: Env, ctx: InterpCtx): Generator<PendingAction, void, void> {
  switch (s.t) {
    case "ExprStmt": {
      // Special case: command call at statement level → yield PendingAction.
      if (s.expr.t === "Call" && s.expr.callee.t === "Ident" && COMMAND_NAMES.has(s.expr.callee.name)) {
        const name = s.expr.callee.name;
        const args = s.expr.args.map(a => evalExpr(a, env, ctx));
        const action = buildPendingAction(name, args);
        if (s.loc) action.loc = s.loc;
        yield action;
        return;
      }
      evalExpr(s.expr, env, ctx);
      return;
    }
    case "Assign": {
      const v = evalExpr(s.value, env, ctx);
      if (s.target.t === "Ident") {
        envSet(env, s.target.name, v);
      } else if (s.target.t === "Index") {
        const obj = evalExpr(s.target.obj, env, ctx) as any;
        const key = evalExpr(s.target.key, env, ctx) as any;
        obj[key] = v;
      } else {
        const obj = evalExpr(s.target.obj, env, ctx) as any;
        obj[s.target.name] = v;
      }
      return;
    }
    case "If": {
      if (truthy(evalExpr(s.cond, env, ctx))) {
        yield* execStmts(s.then, makeEnv(env), ctx);
      } else if (s.else) {
        yield* execStmts(s.else, makeEnv(env), ctx);
      }
      return;
    }
    case "While": {
      while (truthy(evalExpr(s.cond, env, ctx))) {
        yield* execStmts(s.body, makeEnv(env), ctx);
      }
      return;
    }
    case "For": {
      const iter = evalExpr(s.iter, env, ctx);
      if (!Array.isArray(iter)) return;
      for (const item of iter) {
        const sub = makeEnv(env);
        sub.vars.set(s.name, item);
        yield* execStmts(s.body, sub, ctx);
      }
      return;
    }
    case "Block": {
      yield* execStmts(s.body, makeEnv(env), ctx);
      return;
    }
    case "FuncDef": {
      // Already registered at compile time; treat as no-op here.
      env.funcs.set(s.name, s);
      return;
    }
    case "Return": {
      // Return value is thrown as a sentinel; user funcs catch it.
      throw new ReturnSignal(s.value ? evalExpr(s.value, env, ctx) : undefined);
    }
    case "EventHandler": {
      // Handlers are collected at compile time; no-op here.
      return;
    }
  }
}

class ReturnSignal {
  constructor(public value: unknown) {}
}

// ──────────────────────────── expression eval (sync) ────────────────────────────

function evalExpr(e: Expr, env: Env, ctx: InterpCtx): unknown {
  switch (e.t) {
    case "Literal": return e.value;
    case "Ident": {
      // `me` and query names are in ctx-bound scope; check built-ins first.
      if (e.name === "me") return queries.me(ctx.world, ctx.self);
      const v = envGet(env, e.name);
      if (v !== undefined) return v;
      return undefined;
    }
    case "ArrayLit": return e.items.map(i => evalExpr(i, env, ctx));
    case "BinOp": {
      // Short-circuit for && / ||
      if (e.op === "&&") {
        const a = evalExpr(e.a, env, ctx);
        return truthy(a) ? evalExpr(e.b, env, ctx) : a;
      }
      if (e.op === "||") {
        const a = evalExpr(e.a, env, ctx);
        return truthy(a) ? a : evalExpr(e.b, env, ctx);
      }
      const a = evalExpr(e.a, env, ctx) as any;
      const b = evalExpr(e.b, env, ctx) as any;
      switch (e.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "==": return a === b;
        case "!=": return a !== b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
      }
      return undefined;
    }
    case "UnaryOp": {
      const a = evalExpr(e.a, env, ctx) as any;
      if (e.op === "-") return -a;
      if (e.op === "!") return !truthy(a);
      return undefined;
    }
    case "Index": {
      const obj = evalExpr(e.obj, env, ctx) as any;
      const key = evalExpr(e.key, env, ctx) as any;
      return obj == null ? undefined : obj[key];
    }
    case "Member": {
      const obj = evalExpr(e.obj, env, ctx) as any;
      return obj == null ? undefined : obj[e.name];
    }
    case "Call": {
      // Query: bare identifier callee matching a query name.
      if (e.callee.t === "Ident") {
        const name = e.callee.name;
        if (name in queries) {
          const args = e.args.map(a => evalExpr(a, env, ctx));
          return (queries as any)[name](ctx.world, ctx.self, ...args);
        }
        if (COMMAND_NAMES.has(name)) {
          // Called from expression context — not supported. Return undefined.
          return undefined;
        }
        const fn = env.funcs.get(name);
        if (fn) return callUserFunc(fn, e.args.map(a => evalExpr(a, env, ctx)), env, ctx);
      }
      return undefined;
    }
  }
}

function callUserFunc(fn: FuncDef, args: unknown[], env: Env, ctx: InterpCtx): unknown {
  const local = makeEnv(env);
  fn.params.forEach((p, i) => local.vars.set(p, args[i]));
  // Synchronous drive: run generator, discard any pending actions (command
  // calls inside expression-called funcs are not supported).
  try {
    const gen = execStmts(fn.body, local, ctx);
    // Exhaust: if it ever yields a command, that's a runtime error in MVP.
    let r = gen.next();
    while (!r.done) {
      // Silently drop — alternative: throw. Kept soft for MVP.
      r = gen.next();
    }
    return undefined;
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    throw e;
  }
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  return true;
}

// ──────────────────────────── pending-action builder ────────────────────────────

function buildPendingAction(name: string, args: unknown[]): PendingAction {
  switch (name) {
    case "approach": return { kind: "approach", cost: COST.approach, target: args[0] };
    case "flee":     return { kind: "flee",     cost: COST.flee,     target: args[0] };
    case "attack":   return { kind: "attack",   cost: COST.attack,   target: args[0] };
    case "cast":     return { kind: "cast",     cost: COST.cast,     spell: String(args[0] ?? ""), target: args[1] };
    case "wait":     return { kind: "wait",     cost: COST.wait };
    case "exit":     return { kind: "exit",     cost: COST.exit,     door: (args[0] as Direction) };
    case "halt":     return { kind: "halt",     cost: 0 };
  }
  // Unreachable: COMMAND_NAMES is the authoritative set.
  throw new Error(`unknown command ${name}`);
}
