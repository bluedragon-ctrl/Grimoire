// Primitive registry. Spells are declared as a sequence of primitive
// invocations (SpellOp[]). Each primitive takes the caster, a resolved
// target ref (Actor or Pos), and a raw args bag — returns GameEvent[].
//
// Phase 6 ships 4 real primitives + 4 stubs. Stubs are callable (no throw)
// so spell content using them doesn't crash; they emit ActionFailed plus,
// for explode, a VisualBurst so visual adapters can still hook the effect
// site.

import type { Actor, Cloud, GameEvent, Pos, World, EffectKind } from "../types.js";
import { scale, scaleRadius } from "../content/scaling.js";
import { applyEffect } from "../effects.js";
import { createActor, MONSTER_TEMPLATES } from "../content/monsters.js";
import { DSLRuntimeError } from "../lang/errors.js";

export type PrimitiveTargetType = "actor" | "tile" | "self";
export type PrimitiveName =
  | "project" | "inflict" | "heal" | "spawn_cloud"
  | "explode" | "summon" | "teleport" | "push";

export type TargetRef = Actor | Pos;

export interface Primitive {
  name: PrimitiveName;
  targetType: PrimitiveTargetType;
  execute(
    world: World,
    caster: Actor,
    target: TargetRef,
    args: Record<string, unknown>,
  ): GameEvent[];
}

function asActor(t: TargetRef): Actor | null {
  if (t && typeof (t as Actor).id === "string" && typeof (t as Actor).hp === "number") {
    return t as Actor;
  }
  return null;
}

function asPos(t: TargetRef): Pos | null {
  if (!t) return null;
  if (typeof (t as Actor).id === "string" && (t as Actor).pos) return (t as Actor).pos;
  if (typeof (t as Pos).x === "number" && typeof (t as Pos).y === "number") {
    return { x: (t as Pos).x, y: (t as Pos).y };
  }
  return null;
}

// ──────────────────────────── implemented ────────────────────────────

const project: Primitive = {
  name: "project",
  targetType: "actor",
  execute(_world, caster, target, args) {
    const t = asActor(target);
    if (!t) return [];
    const base = Number(args.damage ?? 0);
    const dmg = scale(base, caster.int ?? 0);
    t.hp -= dmg;
    const events: GameEvent[] = [
      { type: "Hit", actor: t.id, attacker: caster.id, damage: dmg },
    ];
    if (t.hp <= 0 && t.alive) {
      t.alive = false;
      events.push({ type: "Died", actor: t.id });
      if (t.isHero) events.push({ type: "HeroDied", actor: t.id });
    }
    return events;
  },
};

const inflict: Primitive = {
  name: "inflict",
  targetType: "actor",
  execute(world, caster, target, args) {
    const t = asActor(target);
    if (!t) return [];
    const kind = String(args.kind) as EffectKind;
    const baseDuration = Number(args.duration ?? 0);
    const duration = scale(baseDuration, caster.int ?? 0);
    // magnitude scales with INT; the scaled value enters applyEffect and Phase-5
    // stacking rules (first-write-wins, duration refreshes) apply after.
    const rawMag = args.magnitude !== undefined ? Number(args.magnitude) : undefined;
    const magnitude = rawMag !== undefined ? scale(rawMag, caster.int ?? 0) : undefined;
    return applyEffect(world, t.id, kind, duration, {
      source: { type: "actor", id: caster.id },
      ...(magnitude !== undefined ? { magnitude } : {}),
    });
  },
};

const heal: Primitive = {
  name: "heal",
  targetType: "actor",
  execute(_world, caster, target, args) {
    const t = asActor(target);
    if (!t) return [];
    const base = Number(args.amount ?? 0);
    const amount = scale(base, caster.int ?? 0);
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + amount);
    const actual = t.hp - before;
    return [{ type: "Healed", actor: t.id, amount: actual }];
  },
};

function genCloudId(world: World): string {
  const n = (world.primitiveSeq ?? 0) + 1;
  world.primitiveSeq = n;
  return `cl${n}`;
}

const spawn_cloud: Primitive = {
  name: "spawn_cloud",
  targetType: "tile",
  execute(world, caster, target, args) {
    const pos = asPos(target);
    if (!pos) return [];
    const kind = String(args.kind);
    const baseDur = Number(args.duration ?? 0);
    const duration = scale(baseDur, caster.int ?? 0);
    const cloud: Cloud = {
      id: genCloudId(world),
      pos: { ...pos },
      kind,
      duration,
      remaining: duration,
      source: caster.id,
    };
    const clouds = world.room.clouds ?? (world.room.clouds = []);
    clouds.push(cloud);
    const ev: GameEvent = {
      type: "CloudSpawned",
      id: cloud.id,
      pos: { ...cloud.pos },
      kind,
      ...(typeof args.visual === "string" ? { visual: args.visual as string } : {}),
      ...(typeof args.element === "string" ? { element: args.element as string } : {}),
    };
    return [ev];
  },
};

// ──────────────────────────── stubs ────────────────────────────

function stubActionFailed(caster: Actor, name: PrimitiveName): GameEvent {
  return {
    type: "ActionFailed",
    actor: caster.id,
    action: "cast",
    reason: `Primitive '${name}' is not implemented yet`,
  };
}

const explode: Primitive = {
  name: "explode",
  targetType: "tile",
  execute(world, caster, target, args) {
    const pos = asPos(target);
    if (!pos) return [];

    const selfCenter = Boolean(args.selfCenter);
    const radius     = scaleRadius(Number(args.radius ?? 0), caster.int ?? 0);
    const damage     = scale(Number(args.damage ?? 0), caster.int ?? 0);
    const kind       = args.kind ? String(args.kind) as EffectKind : undefined;
    const duration   = kind ? scale(Number(args.duration ?? 0), caster.int ?? 0) : 0;
    const rawMag     = args.magnitude !== undefined ? Number(args.magnitude) : undefined;
    const magnitude  = rawMag !== undefined ? scale(rawMag, caster.int ?? 0) : undefined;

    const events: GameEvent[] = [];

    if (typeof args.visual === "string") {
      events.push({
        type: "VisualBurst",
        pos: { ...pos },
        visual: args.visual as string,
        ...(typeof args.element === "string" ? { element: args.element as string } : {}),
      });
    }

    // Sweep every tile within Chebyshev radius of the target position.
    // Wall filter: tiles outside room bounds are skipped (structural wall map TBD).
    // selfCenter: true → caster excluded even when standing on the target tile.
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = pos.x + dx;
        const ty = pos.y + dy;
        if (tx < 0 || ty < 0 || tx >= world.room.w || ty >= world.room.h) continue;

        for (const actor of world.actors) {
          if (!actor.alive) continue;
          if (actor.pos.x !== tx || actor.pos.y !== ty) continue;
          if (selfCenter && actor.id === caster.id) continue;

          if (damage > 0) {
            actor.hp -= damage;
            events.push({ type: "Hit", actor: actor.id, attacker: caster.id, damage });
            if (actor.hp <= 0 && actor.alive) {
              actor.alive = false;
              events.push({ type: "Died", actor: actor.id });
              if (actor.isHero) events.push({ type: "HeroDied", actor: actor.id });
            }
          }

          if (kind) {
            events.push(...applyEffect(world, actor.id, kind, duration, {
              source: { type: "actor", id: caster.id },
              ...(magnitude !== undefined ? { magnitude } : {}),
            }));
          }
        }
      }
    }

    return events;
  },
};

const summon: Primitive = {
  name: "summon",
  targetType: "tile",
  execute(world, caster, target, args) {
    const pos = asPos(target);
    if (!pos) return [stubActionFailed(caster, "summon")];

    // Tile must be in-bounds and unoccupied.
    if (pos.x < 0 || pos.y < 0 || pos.x >= world.room.w || pos.y >= world.room.h) {
      return [{ type: "ActionFailed", actor: caster.id, action: "cast", reason: "target tile is out of bounds" }];
    }
    const occupied = world.actors.some(a => a.alive && a.pos.x === pos.x && a.pos.y === pos.y);
    if (occupied) {
      return [{ type: "ActionFailed", actor: caster.id, action: "cast", reason: "target tile is occupied" }];
    }

    // Template lookup — missing template is a content error, throw DSLRuntimeError.
    const templateId = String(args.template ?? "");
    const tpl = MONSTER_TEMPLATES[templateId];
    if (!tpl) throw new DSLRuntimeError(`Unknown monster template '${templateId}'.`);

    // Per-caster cap: max(1, floor(int/4)).
    const cap = Math.max(1, Math.floor((caster.int ?? 0) / 4));
    const owned = world.actors.filter(a => a.alive && a.owner === caster.id).length;
    if (owned >= cap) {
      return [{ type: "ActionFailed", actor: caster.id, action: "cast", reason: "summon cap reached" }];
    }

    // Spawn the new actor with caster's faction, ownership, and summoned flag.
    const n = (world.actorSeq ?? 0) + 1;
    world.actorSeq = n;
    const newActor = createActor(templateId, pos, `s${n}`);
    newActor.faction = caster.faction ?? (caster.isHero ? "player" : "enemy");
    newActor.owner = caster.id;
    newActor.summoned = true;
    world.actors.push(newActor);

    const visual = typeof args.visual === "string" ? args.visual : "summon_portal";
    const element = typeof args.element === "string" ? args.element : "arcane";

    return [
      { type: "Summoned", actor: newActor.id, summoner: caster.id, template: templateId, pos: { ...pos } },
      { type: "VisualBurst", pos: { ...pos }, visual, element },
    ];
  },
};

const teleport: Primitive = {
  name: "teleport",
  targetType: "tile",
  execute(_world, caster) { return [stubActionFailed(caster, "teleport")]; },
};

const push: Primitive = {
  name: "push",
  targetType: "actor",
  execute(_world, caster) { return [stubActionFailed(caster, "push")]; },
};

export const PRIMITIVES: Record<PrimitiveName, Primitive> = {
  project, inflict, heal, spawn_cloud, explode, summon, teleport, push,
};
