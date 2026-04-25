// Shared formatter for wearable proc descriptions.
// Used by the inventory panel and (future) help pages so both surfaces show
// identical human-readable text. Single source of truth per §3 of Phase 13.7.

import type { ItemDef, ProcSpec, AuraSpec } from "../types.js";

export function formatAura(aura: AuraSpec): string {
  const mag = (aura.magnitude ?? 1) !== 1 ? ` +${aura.magnitude}/turn` : " +1/turn";
  return `While equipped: ${aura.kind}${mag}`;
}

function procEffectDesc(proc: ProcSpec, verb: "inflict" | "gain"): string {
  const chStr = proc.chance !== undefined && proc.chance < 100 ? `${proc.chance}% chance to ` : "";
  if (proc.effect) {
    const e = proc.effect;
    return `${chStr}${verb} ${e.kind} (${e.duration} turns)`;
  }
  if (proc.damage !== undefined) {
    return proc.damage < 0 ? `heal ${-proc.damage}` : `deal ${proc.damage} damage`;
  }
  return "";
}

export function formatOnHit(proc: ProcSpec): string {
  return `On melee hit: ${procEffectDesc(proc, "inflict")}`;
}

export function formatOnDamage(proc: ProcSpec): string {
  const chStr = proc.chance !== undefined && proc.chance < 100 ? `${proc.chance}% chance to ` : "";
  if (proc.effect) {
    const e = proc.effect;
    if (proc.target === "self") {
      return `When hit: ${chStr}gain ${e.kind} (${e.duration} turns)`;
    }
    return `When hit: ${chStr}applies ${e.kind} (${e.duration} turns) to ${proc.target}`;
  }
  if (proc.damage !== undefined) {
    return `When hit: ${proc.damage < 0 ? `gain ${-proc.damage} HP` : `take ${proc.damage} damage`}`;
  }
  return "When hit: (no effect)";
}

export function formatOnKill(proc: ProcSpec): string {
  return `On kill: ${procEffectDesc(proc, "gain")}`;
}

export function formatOnCast(proc: ProcSpec): string {
  return `On cast: ${procEffectDesc(proc, "gain")}`;
}

/** Returns every proc description line for a wearable ItemDef.
 *  Returns [] for non-equipment or items with no procs. */
export function formatItemProcs(def: ItemDef): string[] {
  if (def.kind !== "equipment") return [];
  const lines: string[] = [];
  if (def.aura)      lines.push(formatAura(def.aura));
  if (def.on_hit)    lines.push(formatOnHit(def.on_hit));
  if (def.on_damage) lines.push(formatOnDamage(def.on_damage));
  if (def.on_kill)   lines.push(formatOnKill(def.on_kill));
  if (def.on_cast)   lines.push(formatOnCast(def.on_cast));
  return lines;
}
