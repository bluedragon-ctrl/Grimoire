// Cloud lifecycle. Runs each scheduler tick after tickEffects, before the
// next actor action slot. For each cloud:
//   1. Find all live actors standing on the cloud's tile. Apply the
//      configured effect via applyEffect (Phase 5 "refresh duration" semantics
//      cover re-entry / repeat ticks).
//   2. Emit CloudTicked if anyone was affected.
//   3. Decrement remaining; if ≤ 0 emit CloudExpired and remove the cloud.

import type { GameEvent, World } from "./types.js";
import { applyEffect } from "./effects.js";
import { CLOUD_KINDS } from "./content/clouds.js";

export function tickClouds(world: World): GameEvent[] {
  const clouds = world.room.clouds;
  if (!clouds || clouds.length === 0) return [];

  const out: GameEvent[] = [];
  // Snapshot: we may splice during iteration.
  const list = [...clouds];

  for (const cloud of list) {
    const spec = CLOUD_KINDS[cloud.kind];
    const appliedTo: string[] = [];
    if (spec) {
      for (const a of world.actors) {
        if (!a.alive) continue;
        if (a.pos.x !== cloud.pos.x || a.pos.y !== cloud.pos.y) continue;
        const ev = applyEffect(world, a.id, spec.effect.kind, spec.effect.duration, {
          source: cloud.source !== undefined ? { type: "actor", id: cloud.source } : undefined,
        });
        if (ev.length > 0) {
          appliedTo.push(a.id);
          out.push(...ev);
        }
      }
    }
    if (appliedTo.length > 0) {
      out.push({ type: "CloudTicked", id: cloud.id, appliedTo });
    }

    cloud.remaining -= 1;
    if (cloud.remaining <= 0) {
      out.push({ type: "CloudExpired", id: cloud.id });
      const idx = clouds.indexOf(cloud);
      if (idx >= 0) clouds.splice(idx, 1);
    }
  }

  return out;
}
