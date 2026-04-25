// Generator-based evaluator over the full AST.
//
// A script compiles into a main generator; handler ASTs compile into
// handler-generator factories. Both yield PendingAction values at command
// sites. Expressions are also generators: a command call inside an expression
// (e.g. `if cast("burn", t):`) yields a PendingAction and is resumed with the
// boolean success result fed back by the scheduler.

import type {
  Script, Stmt, Expr, PendingAction, Actor, World, EventHandler, FuncDef, Direction,
} from "./types.js";
import { COST, queries } from "./commands.js";
import { DSLRuntimeError } from "./lang/errors.js";
import { isActorObj, actorMember, UNSET } from "./lang/actor-surface.js";
import { Collection, asIterableArray, listLength } from "./lang/collection.js";

// Command names that yield a PendingAction. In statement position the result
// is discarded; in expression position it resolves to the bool success.
const COMMAND_NAMES = new Set([
  "approach", "flee", "attack", "cast", "wait", "exit", "halt", "use",
  "pickup", "drop", "summon", "notify",
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
  makeMain(): Generator<PendingAction, void, unknown>;
  handlerFor(event: string): EventHandler | undefined;
  makeHandler(h: EventHandler, eventValue: unknown): Generator<PendingAction, void, unknown>;
}

export function compile(script: Script, ctx: InterpCtx): CompiledScript {
  const funcs = new Map<string, FuncDef>();
  for (const f of script.funcs) funcs.set(f.name, f);

  const makeMain = (): Generator<PendingAction, void, unknown> => {
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

function* execStmts(stmts: Stmt[], env: Env, ctx: InterpCtx): Generator<PendingAction, void, unknown> {
  for (const s of stmts) {
    yield* execStmt(s, env, ctx);
  }
}

function* execStmt(s: Stmt, env: Env, ctx: InterpCtx): Generator<PendingAction, void, unknown> {
  switch (s.t) {
    case "ExprStmt": {
      // User-function call at statement level: inline the body so commands
      // inside flow through the outer generator (their bool returns are dropped).
      if (s.expr.t === "Call" && s.expr.callee.t === "Ident") {
        const fn = env.funcs.get(s.expr.callee.name);
        if (fn) {
          const args: unknown[] = [];
          for (const a of s.expr.args) args.push(yield* evalExpr(a, env, ctx));
          yield* runUserFuncStmt(fn, args, env, ctx);
          return;
        }
      }
      // Drop the resulting value — including command-call bools.
      yield* evalExpr(s.expr, env, ctx);
      return;
    }
    case "Assign": {
      const v = yield* evalExpr(s.value, env, ctx);
      if (s.target.t === "Ident") {
        envSet(env, s.target.name, v);
      } else if (s.target.t === "Index") {
        const obj = (yield* evalExpr(s.target.obj, env, ctx)) as any;
        const key = (yield* evalExpr(s.target.key, env, ctx)) as any;
        if (obj instanceof Collection) obj.items[key] = v;
        else obj[key] = v;
      } else {
        const obj = (yield* evalExpr(s.target.obj, env, ctx)) as any;
        obj[s.target.name] = v;
      }
      return;
    }
    case "If": {
      if (truthy(yield* evalExpr(s.cond, env, ctx))) {
        yield* execStmts(s.then, makeEnv(env), ctx);
      } else if (s.else) {
        yield* execStmts(s.else, makeEnv(env), ctx);
      }
      return;
    }
    case "While": {
      while (truthy(yield* evalExpr(s.cond, env, ctx))) {
        try {
          yield* execStmts(s.body, makeEnv(env), ctx);
        } catch (sig) {
          if (sig instanceof BreakSignal) return;
          if (sig instanceof ContinueSignal) continue;
          throw sig;
        }
      }
      return;
    }
    case "For": {
      const iter = yield* evalExpr(s.iter, env, ctx);
      const items = asIterableArray(iter);
      if (!items) return;
      for (const item of items) {
        const sub = makeEnv(env);
        sub.vars.set(s.name, item);
        try {
          yield* execStmts(s.body, sub, ctx);
        } catch (sig) {
          if (sig instanceof BreakSignal) return;
          if (sig instanceof ContinueSignal) continue;
          throw sig;
        }
      }
      return;
    }
    case "Break": throw new BreakSignal();
    case "Continue": throw new ContinueSignal();
    case "Pass": return;
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
      throw new ReturnSignal(s.value ? yield* evalExpr(s.value, env, ctx) : undefined);
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
class BreakSignal {}
class ContinueSignal {}

function* runUserFuncStmt(
  fn: FuncDef, args: unknown[], env: Env, ctx: InterpCtx,
): Generator<PendingAction, void, unknown> {
  const local = makeEnv(env);
  // Per Python LEGB, names defined inside a function (including nested defs)
  // shouldn't leak to callers. Give the local frame its own funcs map.
  local.funcs = new Map(local.funcs);
  fn.params.forEach((p, i) => local.vars.set(p, args[i]));
  try {
    yield* execStmts(fn.body, local, ctx);
  } catch (e) {
    if (e instanceof ReturnSignal) return; // statement-level call drops the value
    throw e;
  }
}

// ──────────────────────────── expression eval (generator) ────────────────────────────

function* evalExpr(e: Expr, env: Env, ctx: InterpCtx): Generator<PendingAction, unknown, unknown> {
  switch (e.t) {
    case "Literal": return e.value;
    case "Ident": {
      // `me` and query names are in ctx-bound scope; check built-ins first.
      if (e.name === "me") return queries.me(ctx.world, ctx.self);
      const v = envGet(env, e.name);
      if (v !== undefined) return v;
      return undefined;
    }
    case "ArrayLit": {
      const out: unknown[] = [];
      for (const i of e.items) out.push(yield* evalExpr(i, env, ctx));
      return new Collection(out);
    }
    case "Lambda": {
      const captured = env;
      const lambdaCtx = ctx;
      return (...args: unknown[]) => {
        const local = makeEnv(captured);
        e.params.forEach((p, i) => local.vars.set(p, args[i]));
        return runExprSync(evalExpr(e.body, local, lambdaCtx), "lambda body");
      };
    }
    case "BinOp": {
      // Short-circuit for && / ||
      if (e.op === "&&") {
        const a = yield* evalExpr(e.a, env, ctx);
        return truthy(a) ? (yield* evalExpr(e.b, env, ctx)) : a;
      }
      if (e.op === "||") {
        const a = yield* evalExpr(e.a, env, ctx);
        return truthy(a) ? a : (yield* evalExpr(e.b, env, ctx));
      }
      const a = (yield* evalExpr(e.a, env, ctx)) as any;
      const b = (yield* evalExpr(e.b, env, ctx)) as any;
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
      const a = (yield* evalExpr(e.a, env, ctx)) as any;
      if (e.op === "-") return -a;
      if (e.op === "!") return !truthy(a);
      return undefined;
    }
    case "Index": {
      const obj = (yield* evalExpr(e.obj, env, ctx)) as any;
      const key = (yield* evalExpr(e.key, env, ctx)) as any;
      if (obj == null) return undefined;
      if (obj instanceof Collection) return obj.items[key];
      return obj[key];
    }
    case "Member": {
      const obj = (yield* evalExpr(e.obj, env, ctx)) as any;
      if (obj == null) return undefined;
      if (isActorObj(obj)) {
        const v = actorMember(obj, e.name, { world: ctx.world });
        if (v !== UNSET) return v;
      }
      return obj[e.name];
    }
    case "Call": {
      // Query / command / builtin / user-function: bare identifier callee.
      if (e.callee.t === "Ident") {
        const name = e.callee.name;
        if (name in queries) {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          const result = (queries as any)[name](ctx.world, ctx.self, ...args);
          // Promote raw arrays from query results to Collection for chainable
          // method dispatch. Scalar query results pass through unchanged.
          return Array.isArray(result) ? new Collection(result) : result;
        }
        if (COMMAND_NAMES.has(name)) {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          const action = buildPendingAction(name, args);
          if (e.loc) action.loc = e.loc;
          action.locals = snapshotEnv(env);
          // Scheduler resumes us with a bool: true = action completed, false =
          // ActionFailed. In statement position the bool is simply discarded.
          const ok = yield action;
          return ok === undefined ? true : !!ok;
        }
        // Pythonic builtins.
        if (name === "len") {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          const n = listLength(args[0]);
          return n ?? 0;
        }
        if (name === "min" || name === "max") {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          return builtinMinMax(name, args);
        }
        const fn = env.funcs.get(name);
        if (fn) {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          return callUserFunc(fn, args, env, ctx);
        }
      }
      // Method call: evaluate obj + method separately so JS class methods
      // (e.g. Collection.filter) retain their `this`.
      if (e.callee.t === "Member") {
        const obj = yield* evalExpr(e.callee.obj, env, ctx);
        if (obj == null) return undefined;
        let method: unknown;
        if (isActorObj(obj)) {
          const v = actorMember(obj, e.callee.name, { world: ctx.world });
          method = v === UNSET ? (obj as any)[e.callee.name] : v;
        } else {
          method = (obj as any)[e.callee.name];
        }
        if (typeof method === "function") {
          const args: unknown[] = [];
          for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
          return (method as Function).apply(obj, args);
        }
        return undefined;
      }
      // Any other callable (e.g. a lambda stored in a variable).
      const callee = yield* evalExpr(e.callee, env, ctx);
      if (typeof callee === "function") {
        const args: unknown[] = [];
        for (const a of e.args) args.push(yield* evalExpr(a, env, ctx));
        return (callee as (...a: unknown[]) => unknown)(...args);
      }
      return undefined;
    }
  }
}

// Drive an evalExpr generator synchronously. Used in expression-only contexts
// (lambda bodies, expression-position user-func calls) where commands aren't
// supported — yielding a PendingAction signals misuse and throws.
function runExprSync(gen: Generator<PendingAction, unknown, unknown>, where: string): unknown {
  const r = gen.next();
  if (!r.done) {
    throw new DSLRuntimeError(`commands are not allowed in ${where}`);
  }
  return r.value;
}

function callUserFunc(fn: FuncDef, args: unknown[], env: Env, ctx: InterpCtx): unknown {
  const local = makeEnv(env);
  local.funcs = new Map(local.funcs);
  fn.params.forEach((p, i) => local.vars.set(p, args[i]));
  // Synchronous drive: command calls inside expression-position user funcs
  // are not supported; they throw rather than yielding through.
  try {
    const gen = execStmts(fn.body, local, ctx);
    const r = gen.next();
    if (!r.done) {
      throw new DSLRuntimeError("function with action cannot be called in expression position");
    }
    return undefined;
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    throw e;
  }
}

// Flatten the live env chain into a plain object (innermost wins). Used by
// the debugger's inspect() to surface locals without leaking Env internals.
export function snapshotEnv(env: Env): Record<string, unknown> {
  const chain: Env[] = [];
  for (let e: Env | null = env; e; e = e.parent) chain.push(e);
  const out: Record<string, unknown> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    for (const [k, v] of chain[i]!.vars) out[k] = v;
  }
  return out;
}

function builtinMinMax(which: "min" | "max", args: unknown[]): unknown {
  if (args.length === 0) return null;
  const first = args[0];
  const items = first instanceof Collection ? first.items
              : Array.isArray(first) ? first
              : null;
  if (!items || items.length === 0) return null;
  const keyFn = typeof args[1] === "function" ? args[1] as (it: unknown) => any : (it: unknown) => it;
  let bestI = 0;
  let bestK = keyFn(items[0]);
  for (let i = 1; i < items.length; i++) {
    const k = keyFn(items[i]);
    if (which === "min" ? k < bestK : k > bestK) { bestK = k; bestI = i; }
  }
  return items[bestI];
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  // Pythonic emptiness: empty list/Collection/string is falsy.
  if (v instanceof Collection) return v.items.length > 0;
  if (Array.isArray(v)) return v.length > 0;
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
    case "use":      return { kind: "use",      cost: COST.use,      item: args[0], ...(args[1] !== undefined ? { target: args[1] } : {}) };
    case "pickup":   return { kind: "pickup",   cost: COST.pickup,   target: args[0] };
    case "drop":     return { kind: "drop",     cost: COST.drop,     target: args[0] };
    case "summon":   return { kind: "summon",   cost: COST.summon,   template: String(args[0] ?? ""), target: args[1] };
    case "notify":   return { kind: "notify",   cost: 0,             text: String(args[0] ?? ""),
                                                                       style: args[1] !== undefined ? String(args[1]) : undefined,
                                                                       duration: args[2] !== undefined ? Number(args[2]) : undefined,
                                                                       position: args[3] !== undefined ? String(args[3]) : undefined };
  }
  // Unreachable: COMMAND_NAMES is the authoritative set.
  throw new Error(`unknown command ${name}`);
}
