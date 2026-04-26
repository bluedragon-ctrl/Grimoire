// Target resolution + faction helpers shared by command and spell paths.
// Kept separate from commands.ts so that spells/cast.ts and items/execute.ts
// can use them without a circular import through commands.ts.

import type { Actor, Pos, World } from "./types.js";

// Validate `ref` is a living actor currently in the room. Returns it or null.
export function resolveActor(world: World, ref: unknown): Actor | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Actor;
  if (typeof r.id !== "string") return null;
  const found = world.actors.find(a => a.id === r.id);
  if (!found || !found.alive) return null;
  return found;
}

// Lenient position resolver: accepts actors, doors, items, chests, or bare
// Pos-like objects. Used by approach/flee, summon, tile-targeted spells/items.
export function resolvePos(ref: unknown): Pos | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as { pos?: { x?: unknown; y?: unknown }; x?: unknown; y?: unknown };
  if (r.pos && typeof r.pos.x === "number" && typeof r.pos.y === "number") {
    return { x: r.pos.x, y: r.pos.y };
  }
  if (typeof r.x === "number" && typeof r.y === "number") {
    return { x: r.x, y: r.y };
  }
  return null;
}

// Faction resolution with isHero fallback. Two neutrals are neither allies
// nor enemies — treated as not the same faction.
export function sameFaction(a: Actor, b: Actor): boolean {
  const fa = a.faction ?? (a.isHero ? "player" : "enemy");
  const fb = b.faction ?? (b.isHero ? "player" : "enemy");
  if (fa === "neutral" && fb === "neutral") return false;
  return fa === fb;
}
