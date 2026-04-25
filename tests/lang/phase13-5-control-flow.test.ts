// Phase 13.5: control flow — break, continue, pass inside while / for loops.

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

describe("break", () => {
  it("breaks out of a while loop", () => {
    const hero = heroWith(`
i = 0
while i < 100:
  if i == 5:
    break
  i = i + 1
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.i).toBe(5);
  });

  it("breaks out of a for loop", () => {
    const hero = heroWith(`
total = 0
for v in [1, 2, 3, 4, 5]:
  if v == 4:
    break
  total = total + v
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.total).toBe(6);
  });

  it("only breaks out of innermost loop", () => {
    const hero = heroWith(`
hits = 0
for a in [1, 2, 3]:
  for b in [10, 20, 30]:
    if b == 20:
      break
    hits = hits + 1
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.hits).toBe(3);
  });
});

describe("continue", () => {
  it("skips to next iteration in for loop", () => {
    const hero = heroWith(`
total = 0
for v in [1, 2, 3, 4, 5]:
  if v % 2 == 0:
    continue
  total = total + v
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.total).toBe(9);
  });

  it("skips to next iteration in while loop", () => {
    const hero = heroWith(`
i = 0
total = 0
while i < 5:
  i = i + 1
  if i == 3:
    continue
  total = total + i
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.total).toBe(12);
  });
});

describe("pass", () => {
  it("pass is a no-op statement (parses + does nothing)", () => {
    const hero = heroWith(`
n = 7
if n > 0:
  pass
n = n + 1
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.n).toBe(8);
  });

  it("pass as a placeholder body", () => {
    const hero = heroWith(`
for v in [1, 2, 3]:
  pass
done = 1
wait()
halt
`);
    const h = runOnce([hero]);
    expect(h.inspect("h")!.locals.done).toBe(1);
  });
});
