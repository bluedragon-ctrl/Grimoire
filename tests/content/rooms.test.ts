import { describe, it, expect } from "vitest";
import { generateRoom } from "../../src/content/rooms.js";
import { MONSTER_TEMPLATES } from "../../src/content/monsters.js";

// Deterministic stub: cycles through a fixed sequence so tests can assert
// exact picks without depending on mulberry32 output.
function stubRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i++;
    return v;
  };
}

describe("generateRoom", () => {
  it("spawns hero + 2 monsters by default", () => {
    const { room, actors } = generateRoom(1);
    expect(room.w).toBe(10);
    expect(room.h).toBe(10);
    expect(actors.length).toBe(3);
    expect(actors[0]!.id).toBe("hero");
    expect(actors[0]!.isHero).toBe(true);
    expect(actors.slice(1).every(a => !a.isHero)).toBe(true);
  });

  it("picks all monsters from MONSTER_TEMPLATES", () => {
    const { actors } = generateRoom(7);
    for (const a of actors.slice(1)) {
      expect(MONSTER_TEMPLATES[a.kind], `unknown kind ${a.kind}`).toBeTruthy();
    }
  });

  it("same level → identical actors (kind + pos) across calls", () => {
    const a = generateRoom(3);
    const b = generateRoom(3);
    expect(a.actors.map(x => [x.kind, x.pos.x, x.pos.y]))
      .toEqual(b.actors.map(x => [x.kind, x.pos.x, x.pos.y]));
  });

  it("different levels typically produce different monster picks", () => {
    const picks = new Set<string>();
    for (let level = 1; level <= 6; level++) {
      const { actors } = generateRoom(level);
      picks.add(actors.slice(1).map(a => `${a.kind}@${a.pos.x},${a.pos.y}`).join("|"));
    }
    // 6 seeds should yield more than one distinct layout.
    expect(picks.size).toBeGreaterThan(1);
  });

  it("monsters never overlap the hero or each other", () => {
    for (let level = 1; level <= 10; level++) {
      const { actors } = generateRoom(level);
      const seen = new Set<string>();
      for (const a of actors) {
        const k = `${a.pos.x},${a.pos.y}`;
        expect(seen.has(k), `overlap at ${k} on level ${level}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("monsters keep ≥3 Chebyshev distance from hero spawn", () => {
    for (let level = 1; level <= 10; level++) {
      const { actors } = generateRoom(level);
      const hero = actors[0]!;
      for (const m of actors.slice(1)) {
        const d = Math.max(Math.abs(m.pos.x - hero.pos.x), Math.abs(m.pos.y - hero.pos.y));
        expect(d).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("custom rng stream drives picks deterministically", () => {
    // 5 template ids → 0.0 maps to index 0 (goblin), 0.99 maps to last.
    // randInt for pos uses ROOM_W-2=8 range; feed values that land at x=4,y=4 etc.
    const rng = stubRng([0, 0.5, 0.5, 0, 0.5, 0.5]);
    const { actors } = generateRoom(1, rng);
    expect(actors.length).toBeGreaterThanOrEqual(2);
    // First monster is the 0-index template.
    const ids = Object.keys(MONSTER_TEMPLATES);
    expect(actors[1]!.kind).toBe(ids[0]!);
  });

  it("monster ids are m1, m2, ...", () => {
    const { actors } = generateRoom(2);
    expect(actors[1]!.id).toBe("m1");
    expect(actors[2]!.id).toBe("m2");
  });
});
