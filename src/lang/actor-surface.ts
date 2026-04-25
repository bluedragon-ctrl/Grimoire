// Actor surface for the DSL: snake_case property aliases + bound methods.
//
// `me.is_hero`, `me.summoner`, `me.distance_to(other)`, etc. resolve here.
// Plain camelCase fields (hp, maxHp, mp, atk, pos, ...) fall through to the
// raw Actor object — the dispatcher returns the sentinel UNSET so the caller
// reads obj[name] directly.
//
// Methods are returned as JS closures bound to (actor, world). The Call case
// in the interpreter invokes any callable a Member resolves to.

import type { Actor, World } from "../types.js";
import { hasEffect, listEffects } from "../effects.js";
import { hasLineOfSight } from "../los.js";
import { validateCast } from "../spells/cast.js";
import { Collection } from "./collection.js";

export const UNSET: unique symbol = Symbol("UNSET");
export type ActorSurfaceCtx = { world: World };

export function isActorObj(v: unknown): v is Actor {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<Actor>;
  return typeof a.id === "string"
      && typeof a.hp === "number"
      && typeof a.alive === "boolean"
      && !!a.pos;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function asPosLike(v: unknown): { x: number; y: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as any;
  if (o.pos && typeof o.pos.x === "number" && typeof o.pos.y === "number") return o.pos;
  if (typeof o.x === "number" && typeof o.y === "number") return { x: o.x, y: o.y };
  return null;
}

// Resolve member access on an actor. Returns UNSET to indicate "not handled —
// fall through to obj[name]".
export function actorMember(actor: Actor, name: string, ctx: ActorSurfaceCtx): unknown {
  switch (name) {
    // Boolean projections renamed to Pythonic snake_case.
    case "is_hero":     return actor.isHero === true;
    case "is_summoned": return actor.summoned === true;

    // Summoner: resolve owner id to an actor object (or null if gone).
    case "summoner": {
      const ownerId = actor.owner;
      if (!ownerId) return null;
      const found = ctx.world.actors.find(a => a.id === ownerId && a.alive);
      return found ?? null;
    }

    // Methods — return bound JS closures. Call eval invokes them.
    case "distance_to": return (other: unknown) => {
      const p = asPosLike(other);
      if (!p) return 0;
      return chebyshev(actor.pos.x, actor.pos.y, p.x, p.y);
    };
    case "adjacent_to": return (other: unknown) => {
      const p = asPosLike(other);
      if (!p) return false;
      return chebyshev(actor.pos.x, actor.pos.y, p.x, p.y) === 1;
    };
    case "has_effect": return (kind: unknown) => {
      if (typeof kind !== "string") return false;
      return hasEffect(actor, kind);
    };
    case "effect_remaining": return (kind: unknown) => {
      if (typeof kind !== "string") return 0;
      const eff = (actor.effects ?? []).find(e => e.kind === kind);
      return eff ? eff.remaining : 0;
    };
    case "effect_magnitude": return (kind: unknown) => {
      if (typeof kind !== "string") return 0;
      const eff = (actor.effects ?? []).find(e => e.kind === kind);
      return eff ? (eff.magnitude ?? 0) : 0;
    };
    case "list_effects": return () => new Collection(listEffects(actor));
    case "can_cast": return (spell: unknown, target?: unknown) => {
      if (typeof spell !== "string") return false;
      const v = validateCast(ctx.world, actor, spell, target, {
        skipTarget: target === undefined || target === null,
      });
      return v.ok;
    };
    case "in_los": return (other: unknown) => {
      const p = asPosLike(other);
      if (!p) return false;
      return hasLineOfSight(ctx.world, actor.pos, p);
    };
  }
  return UNSET;
}
