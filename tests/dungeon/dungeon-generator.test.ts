// Dungeon generator tests.

import { describe, it, expect } from "vitest";
import { generateRoom } from "../../src/dungeon/generator.js";

describe("generateRoom (depth, seed)", () => {
  it("is deterministic — same (depth, seed) produces identical layout", () => {
    const a = generateRoom(3, 12345);
    const b = generateRoom(3, 12345);
    expect(a.room.w).toBe(b.room.w);
    expect(a.room.h).toBe(b.room.h);
    expect(a.room.archetype).toBe(b.room.archetype);
    expect(a.actors.map(x => [x.kind, x.pos.x, x.pos.y])).toEqual(
      b.actors.map(x => [x.kind, x.pos.x, x.pos.y]),
    );
    expect((a.room.objects ?? []).map(o => [o.kind, o.pos.x, o.pos.y, !!o.locked])).toEqual(
      (b.room.objects ?? []).map(o => [o.kind, o.pos.x, o.pos.y, !!o.locked]),
    );
  });

  it("teaching ramp: depths 1–3 never spawn the trap archetype", () => {
    for (let depth = 1; depth <= 3; depth++) {
      for (let seed = 1; seed <= 50; seed++) {
        const r = generateRoom(depth, seed);
        expect(r.room.archetype).not.toBe("trap");
      }
    }
  });

  it("teaching ramp: vault chests at depth ≤ 3 are unlocked", () => {
    for (let depth = 1; depth <= 3; depth++) {
      for (let seed = 1; seed <= 100; seed++) {
        const r = generateRoom(depth, seed);
        if (r.room.archetype !== "vault") continue;
        for (const o of r.room.objects ?? []) {
          if (o.kind === "chest" || o.kind === "door_closed") {
            expect(o.locked, `seed ${seed}: ${o.kind} at depth ${depth} should be unlocked`).toBeFalsy();
          }
        }
      }
    }
  });

  it("at depth 4+ trap archetype CAN appear", () => {
    let foundTrap = false;
    for (let seed = 1; seed <= 200 && !foundTrap; seed++) {
      const r = generateRoom(5, seed);
      if (r.room.archetype === "trap") foundTrap = true;
    }
    expect(foundTrap).toBe(true);
  });

  it("vault rooms have at least one chest object", () => {
    let count = 0;
    for (let seed = 1; seed <= 200 && count < 3; seed++) {
      const r = generateRoom(2, seed);
      if (r.room.archetype !== "vault") continue;
      count++;
      const chests = (r.room.objects ?? []).filter(o => o.kind === "chest");
      expect(chests.length).toBeGreaterThanOrEqual(1);
    }
    expect(count).toBeGreaterThan(0);
  });

  it("trap rooms have a locked exit_door_closed object", () => {
    let foundTrapWithLockedExit = false;
    for (let seed = 1; seed <= 300; seed++) {
      const r = generateRoom(6, seed);
      if (r.room.archetype !== "trap") continue;
      const exitDoor = (r.room.objects ?? []).find(o => o.kind === "exit_door_closed");
      if (exitDoor && exitDoor.locked) foundTrapWithLockedExit = true;
    }
    expect(foundTrapWithLockedExit).toBe(true);
  });

  it("conduit rooms have a fountain object", () => {
    let found = false;
    for (let seed = 1; seed <= 200; seed++) {
      const r = generateRoom(2, seed);
      if (r.room.archetype !== "conduit") continue;
      const f = (r.room.objects ?? []).find(o => o.kind === "fountain_health" || o.kind === "fountain_mana");
      if (f) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it("pre-placed health/mana floor items appear at expected probabilities", () => {
    let hp = 0, mp = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const r = generateRoom(2, i + 1);
      const items = r.room.floorItems ?? [];
      if (items.some(f => f.defId === "health_potion")) hp++;
      if (items.some(f => f.defId === "mana_crystal")) mp++;
    }
    // Expected ~50% / ~40%; broad bounds for tolerance.
    expect(hp / N).toBeGreaterThan(0.30);
    expect(hp / N).toBeLessThan(0.70);
    expect(mp / N).toBeGreaterThan(0.20);
    expect(mp / N).toBeLessThan(0.60);
  });

  it("room size scales with depth", () => {
    const small = generateRoom(1, 1);
    const big = generateRoom(20, 1);
    expect(big.room.w).toBeGreaterThanOrEqual(small.room.w);
    expect(big.room.h * big.room.w).toBeGreaterThanOrEqual(small.room.w * small.room.h - 4);
  });

  it("hero is always actors[0] with isHero=true", () => {
    for (let depth = 1; depth <= 8; depth++) {
      for (let seed = 1; seed <= 5; seed++) {
        const r = generateRoom(depth, seed);
        expect(r.actors[0]!.isHero).toBe(true);
      }
    }
  });

  it("room has the expected door pair (N + S)", () => {
    const r = generateRoom(3, 42);
    const dirs = r.room.doors.map(d => d.dir).sort();
    expect(dirs).toEqual(["N", "S"]);
  });
});

describe("keymaster monsters always drop a key", () => {
  // Find a vault at depth ≥ 4 with a keymaster, simulate its death drops.
  it("vault keymaster has lootTable=keymaster_loot which always drops a key", async () => {
    let foundKeymaster = false;
    for (let seed = 1; seed <= 200; seed++) {
      const r = generateRoom(6, seed);
      if (r.room.archetype !== "vault") continue;
      const km = r.actors.find(a => !a.isHero && a.lootTable === "keymaster_loot");
      if (!km) continue;
      foundKeymaster = true;
      // The keymaster_loot table includes key with chance 1.0.
      const { LOOT_TABLES } = await import("../../src/content/loot.js");
      const table = LOOT_TABLES["keymaster_loot"]!;
      const keyEntry = table.find(e => e.defId === "key");
      expect(keyEntry).toBeTruthy();
      expect(keyEntry!.chance).toBe(1.0);
      break;
    }
    expect(foundKeymaster).toBe(true);
  });
});
