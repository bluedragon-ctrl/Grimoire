// castSpell(world, caster, name, targetRef) — the 6-step validation pipeline.
// Returns GameEvent[]. Emits a single ActionFailed on validation failure
// (no mp deducted, no primitives run). On success: deducts mp, emits Cast,
// then runs each body op through the PRIMITIVES registry.

import type { Actor, GameEvent, Pos, World } from "../types.js";
import { SPELLS, type Spell } from "../content/spells.js";
import { PRIMITIVES, type TargetRef } from "./primitives.js";
import { hasEffect } from "../effects.js";
import { hasLineOfSight } from "../los.js";
import { didYouMean } from "../lang/errors.js";

function fail(caster: Actor, reason: string): GameEvent {
  return { type: "ActionFailed", actor: caster.id, action: "cast", reason };
}

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function resolveTargetActor(world: World, ref: unknown): Actor | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Actor;
  if (typeof r.id !== "string") return null;
  const found = world.actors.find(a => a.id === r.id);
  if (!found || !found.alive) return null;
  return found;
}

function resolvePos(ref: unknown): Pos | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as any;
  if (r.pos && typeof r.pos.x === "number" && typeof r.pos.y === "number") {
    return { x: r.pos.x, y: r.pos.y };
  }
  if (typeof r.x === "number" && typeof r.y === "number") return { x: r.x, y: r.y };
  return null;
}

function targetKindMatches(caster: Actor, spell: Spell, target: Actor | null): boolean {
  switch (spell.targetType) {
    case "ally":  return !!target && target.alive && sameFaction(caster, target);
    case "enemy": return !!target && target.alive && !sameFaction(caster, target);
    case "any":   return !!target && target.alive;
    case "self":  return true; // resolved to caster
    case "tile":  return true; // positional, validated via resolvePos
  }
}

function sameFaction(a: Actor, b: Actor): boolean {
  // Phase 13.2: use explicit faction field with isHero fallback for backward compat.
  const fa = a.faction ?? (a.isHero ? "player" : "enemy");
  const fb = b.faction ?? (b.isHero ? "player" : "enemy");
  // Two neutrals are neither allies nor enemies — treat as not same faction.
  if (fa === "neutral" && fb === "neutral") return false;
  return fa === fb;
}

// Shared validation for steps 1–5. Returns a resolved target on success, or a
// reason string on failure. `skipTarget: true` skips the target-type/range
// checks (used by can_cast(name) with no target argument).
export type ValidateCastResult =
  | { ok: true; spell: Spell; targetActor: Actor | null; targetPos: Pos | null }
  | { ok: false; reason: string };

export function validateCast(
  world: World,
  caster: Actor,
  spellName: string,
  targetRef: unknown,
  opts: { skipTarget?: boolean } = {},
): ValidateCastResult {
  // 1. Known spell?
  const spell = SPELLS[spellName];
  if (!spell) {
    const hint = didYouMean(spellName, Object.keys(SPELLS));
    const msg = hint
      ? `Unknown spell '${spellName}'. Did you mean '${hint}'?`
      : `Unknown spell '${spellName}'.`;
    return { ok: false, reason: msg };
  }

  // 2. Caster has learned it?
  const known = caster.knownSpells ?? [];
  if (!known.includes(spellName)) {
    return { ok: false, reason: `You haven't learned '${spellName}' yet.` };
  }

  let targetActor: Actor | null = null;
  let targetPos: Pos | null = null;

  if (!opts.skipTarget) {
    // 3–4. Resolve target + type/range.
    if (spell.targetType === "self") {
      targetActor = caster;
      targetPos = { ...caster.pos };
    } else if (spell.targetType === "tile") {
      const a = resolveTargetActor(world, targetRef);
      if (a) targetPos = { ...a.pos };
      else targetPos = resolvePos(targetRef);
      if (!targetPos) {
        return { ok: false, reason: `${capitalize(spellName)} needs a tile target.` };
      }
    } else {
      targetActor = resolveTargetActor(world, targetRef);
      if (!targetKindMatches(caster, spell, targetActor)) {
        const need = spell.targetType === "ally" ? "an ally" : spell.targetType === "enemy" ? "an enemy" : "a valid target";
        return { ok: false, reason: `${capitalize(spellName)} needs ${need} target.` };
      }
      targetPos = targetActor!.pos;
    }

    const dist = chebyshev(caster.pos, targetPos!);
    if (dist > spell.range) {
      return { ok: false, reason: `Target is out of range (max ${spell.range} tiles).` };
    }

    // 4b. LOS gate — smoke clouds between caster and target block line of sight.
    // Self-targeted and adjacent targets always have LOS.
    if (spell.targetType !== "self" && dist > 1 && !hasLineOfSight(world, caster.pos, targetPos!)) {
      return { ok: false, reason: "No line of sight to target (smoke)." };
    }
  }

  // 5. Blinded gate: if caster is blinded, ranged targets (Chebyshev > 1) are denied.
  if (!opts.skipTarget && hasEffect(caster, "blinded") && targetPos) {
    const dist = chebyshev(caster.pos, targetPos);
    if (dist > 1) {
      return { ok: false, reason: "You are blinded and can only target adjacent tiles." };
    }
  }

  // 6. Mana.
  const mp = caster.mp ?? 0;
  if (mp < spell.mpCost) {
    return { ok: false, reason: `Not enough mana (needs ${spell.mpCost}, you have ${mp}).` };
  }

  return { ok: true, spell, targetActor, targetPos };
}

export function castSpell(
  world: World,
  caster: Actor,
  spellName: string,
  targetRef: unknown,
): GameEvent[] {
  const v = validateCast(world, caster, spellName, targetRef);
  if (!v.ok) return [fail(caster, v.reason)];
  const { spell, targetActor, targetPos } = v;

  // 6. Deduct mp, emit Cast, run body ops.
  const mp = caster.mp ?? 0;
  caster.mp = mp - spell.mpCost;

  // Cast event: amount defaults to 0 (kept for log compat; primitives emit
  // Hit/Healed with their own magnitudes). For single-primitive spells we
  // surface a best-effort amount so existing wire-adapter/tests that read
  // Cast.amount don't regress.
  const firstOp = spell.body[0];
  const castEvent: GameEvent = {
    type: "Cast",
    actor: caster.id,
    spell: spellName,
    ...(targetActor ? { target: targetActor.id } : {}),
    amount: 0,
    ...(firstOp && typeof firstOp.args.visual === "string" ? { visual: firstOp.args.visual as string } : {}),
    ...(firstOp && typeof firstOp.args.element === "string" ? { element: firstOp.args.element as string } : {}),
  };

  const events: GameEvent[] = [castEvent];

  // Primitive target ref: actor for actor-typed prims, pos for tile-typed.
  for (const op of spell.body) {
    const prim = PRIMITIVES[op.op];
    if (!prim) {
      events.push(fail(caster, `Unknown primitive '${op.op}'.`));
      continue;
    }
    const ref: TargetRef = prim.targetType === "tile"
      ? (targetPos ?? { x: caster.pos.x, y: caster.pos.y })
      : (targetActor ?? caster);
    events.push(...prim.execute(world, caster, ref, op.args));
  }

  // Surface an amount on the Cast event for backward compat (bolt/heal):
  // use damage from Hit or amount from Healed if present.
  const hit = events.find(e => e.type === "Hit") as any;
  const healed = events.find(e => e.type === "Healed") as any;
  if (hit) (castEvent as any).amount = hit.damage;
  else if (healed) (castEvent as any).amount = healed.amount;

  return events;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
