// castSpell(world, caster, name, targetRef) — the 6-step validation pipeline.
// Returns GameEvent[]. Emits a single ActionFailed on validation failure
// (no mp deducted, no primitives run). On success: deducts mp, emits Cast,
// then runs each body op through the PRIMITIVES registry.

import type { Actor, GameEvent, Pos, World } from "../types.js";
import { SPELLS, type Spell } from "../content/spells.js";
import { PRIMITIVES, type TargetRef } from "./primitives.js";
import { hasEffect } from "../effects.js";
import { hasLineOfSight } from "../los.js";
import { didYouMean, actionFailed } from "../lang/errors.js";
import { chebyshev } from "../geometry.js";
import { resolveActor, resolvePos, sameFaction } from "../resolve.js";

function fail(caster: Actor, reason: string): GameEvent {
  return actionFailed(caster, "cast", reason);
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

// Resolve {target actor, target position} for `spell` from a raw DSL ref.
// Returns a typed result; the reason string is the user-facing failure message.
type ResolvedSpellTarget =
  | { ok: true; targetActor: Actor | null; targetPos: Pos }
  | { ok: false; reason: string };

function resolveSpellTarget(world: World, caster: Actor, spell: Spell, spellName: string, targetRef: unknown): ResolvedSpellTarget {
  if (spell.targetType === "self") {
    return { ok: true, targetActor: caster, targetPos: { ...caster.pos } };
  }
  if (spell.targetType === "tile") {
    const a = resolveActor(world, targetRef);
    const pos = a ? { ...a.pos } : resolvePos(targetRef);
    if (!pos) return { ok: false, reason: `${capitalize(spellName)} needs a tile target.` };
    return { ok: true, targetActor: null, targetPos: pos };
  }
  const targetActor = resolveActor(world, targetRef);
  if (!targetKindMatches(caster, spell, targetActor)) {
    const need = spell.targetType === "ally" ? "an ally" : spell.targetType === "enemy" ? "an enemy" : "a valid target";
    return { ok: false, reason: `${capitalize(spellName)} needs ${need} target.` };
  }
  return { ok: true, targetActor, targetPos: targetActor!.pos };
}

// Range gate. Returns null on pass, reason string on fail.
function checkRange(caster: Actor, targetPos: Pos, range: number): string | null {
  if (chebyshev(caster.pos, targetPos) > range) {
    return `Target is out of range (max ${range} tiles).`;
  }
  return null;
}

// LOS gate — smoke clouds block line of sight. Self-targeted and adjacent
// targets always pass. Returns null on pass, reason string on fail.
function checkLineOfSight(world: World, caster: Actor, targetPos: Pos, isSelf: boolean): string | null {
  if (isSelf) return null;
  if (chebyshev(caster.pos, targetPos) <= 1) return null;
  if (!hasLineOfSight(world, caster.pos, targetPos)) {
    return "No line of sight to target (smoke).";
  }
  return null;
}

// Blinded gate — if caster is blinded, ranged targets (Chebyshev > 1) are denied.
function checkBlinded(caster: Actor, targetPos: Pos): string | null {
  if (!hasEffect(caster, "blinded")) return null;
  if (chebyshev(caster.pos, targetPos) <= 1) return null;
  return "You are blinded and can only target adjacent tiles.";
}

// Mana gate.
function checkMana(caster: Actor, cost: number): string | null {
  const mp = caster.mp ?? 0;
  if (mp < cost) return `Not enough mana (needs ${cost}, you have ${mp}).`;
  return null;
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
    // 3–4. Resolve target + type, range, LOS.
    const r = resolveSpellTarget(world, caster, spell, spellName, targetRef);
    if (!r.ok) return r;
    targetActor = r.targetActor;
    targetPos = r.targetPos;

    const rangeFail = checkRange(caster, targetPos, spell.range);
    if (rangeFail) return { ok: false, reason: rangeFail };

    const losFail = checkLineOfSight(world, caster, targetPos, spell.targetType === "self");
    if (losFail) return { ok: false, reason: losFail };
  }

  // 5. Blinded gate.
  if (!opts.skipTarget && targetPos) {
    const blindFail = checkBlinded(caster, targetPos);
    if (blindFail) return { ok: false, reason: blindFail };
  }

  // 6. Mana.
  const manaFail = checkMana(caster, spell.mpCost);
  if (manaFail) return { ok: false, reason: manaFail };

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
