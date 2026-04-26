// Lambdas and `def` user functions — parameter binding,
// lexical capture, return, recursion, LEGB scoping (no leak to caller).

import { describe, it, expect } from "vitest";
import type { Actor } from "../../src/types.js";
import { startRoom } from "../../src/engine.js";
import { parse } from "../../src/lang/parser.js";
import { mkRoom, mkHero } from "../helpers.js";

function heroWith(src: string): Actor {
  return mkHero({ script: parse(src) });
}

function runOnce(actors: Actor[]) {
  const h = startRoom({ room: mkRoom(), actors });
  h.step();
  return h;
}

describe("lambdas — value form", () => {
  it("lambda stored in a variable can be invoked with ()", () => {
    const hero = heroWith(`
double = lambda v: v * 2
n = double(7)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(14);
  });

  it("lambda captures an enclosing local (closure)", () => {
    const hero = heroWith(`
bias = 100
add_bias = lambda v: v + bias
n = add_bias(5)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(105);
  });

  it("lambda with multiple params", () => {
    const hero = heroWith(`
plus = lambda a, b: a + b
n = plus(3, 4)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(7);
  });

  it("lambda used inline in .filter is a fresh scope each call", () => {
    const hero = heroWith(`
xs = [1, 2, 3, 4, 5, 6]
small = xs.filter(lambda v: v < 4)
n = len(small)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(3);
  });

  it("lambda body is expression-only (no statements)", () => {
    expect(() => parse(`
bad = lambda v:
  v + 1
`)).toThrow();
  });
});

describe("def — user functions", () => {
  it("def with simple return", () => {
    const hero = heroWith(`
def square(v):
  return v * v

n = square(6)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(36);
  });

  it("def with branching return", () => {
    const hero = heroWith(`
def sign(v):
  if v > 0:
    return 1
  if v < 0:
    return -1
  return 0

a = sign(7)
b = sign(-3)
c = sign(0)
wait()
halt
`);
    const h = runOnce([hero]);
    const snap = h.inspect("h")!;
    expect(snap.locals.a).toBe(1);
    expect(snap.locals.b).toBe(-1);
    expect(snap.locals.c).toBe(0);
  });

  it("def calling another def", () => {
    const hero = heroWith(`
def square(v):
  return v * v

def sum_of_squares(a, b):
  return square(a) + square(b)

n = sum_of_squares(3, 4)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(25);
  });

  it("def with no return yields null/undefined", () => {
    const hero = heroWith(`
def noop(v):
  x = v + 1

r = noop(5)
wait()
halt
`);
    const h = runOnce([hero]);
    const r = h.inspect("h")!.locals.r;
    expect(r === null || r === undefined).toBe(true);
  });

  it("def supports recursion (factorial)", () => {
    const hero = heroWith(`
def fact(n):
  if n <= 1:
    return 1
  return n * fact(n - 1)

f5 = fact(5)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.f5).toBe(120);
  });

  it("def parameters do NOT leak to caller scope (LEGB)", () => {
    const hero = heroWith(`
def f(x):
  return x + 1

x = 99
r = f(7)
after = x
wait()
halt
`);
    const h = runOnce([hero]);
    const snap = h.inspect("h")!;
    expect(snap.locals.r).toBe(8);
    expect(snap.locals.after).toBe(99);
  });

  it("def's local assignments do NOT leak to caller scope", () => {
    const hero = heroWith(`
def f():
  tmp = 42
  return tmp

r = f()
wait()
halt
`);
    const h = runOnce([hero]);
    const snap = h.inspect("h")!;
    expect(snap.locals.r).toBe(42);
    expect(snap.locals.tmp).toBeUndefined();
  });

  it("def can read enclosing locals (closure-style)", () => {
    const hero = heroWith(`
base = 1000

def add_base(v):
  return v + base

n = add_base(5)
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(1005);
  });

  it("def used as a higher-order argument via lambda wrapper", () => {
    const hero = heroWith(`
def plus_one(v):
  return v + 1

xs = [1, 2, 3]
ys = xs.sorted_by(lambda v: plus_one(v))
top = ys[0]
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.top).toBe(1);
  });
});
