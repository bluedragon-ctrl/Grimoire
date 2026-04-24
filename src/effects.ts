// Effect system: apply → tick → expire. Foundation for spells, item procs,
// clouds, weapon on-hit, and statuses. Phase 5 ships 4 kinds: burning, regen,
// haste, slow. Effect application is internal — Phase 6 wires it to cast(),
// Phase 7 to item use.
//
// Design (see docs/engine-design.md):
// - Stacking: same kind on the same target from any source refreshes remaining
//   to max(existing, new); magnitude does not stack. Different kinds stack.
// - Tick order per scheduler tick: actor actions fire first; AFTER the tick's
//   action phase, effects tick once per actor (decrement remaining, maybe
//   onTick, maybe onExpire).
// - Modifier effects (haste, slow, chill, shock, might, iron_skin, power) do
//   NOT mutate base stats. Callers use effectiveStats(actor) for the modified
//   view. Direct stat changes (damage, healing, mana) still mutate fields.

import type { Actor, Effect, EffectKind, GameEvent, World } from "./types.js";

export interface EffectSpec {
  kind: EffectKind;
  defaultDuration: number;
  defaultMagnitude?: number;
  tickEvery: number;
  onApply?: (world: World, effect: Effect, actor: Actor) => GameEvent[];
  // Called when an effect of this kind already exists on the actor and is
  // refreshed by a new application. Receives the live existing effect and the
  // incoming {magnitude, duration}. The standard stacking logic (refresh
  // remaining to max, keep existing magnitude) already ran before this fires.
  onStack?: (world: World, existing: Effect, incoming: { magnitude?: number; duration: number }, actor: Actor) => GameEvent[];
  onTick?: (world: World, effect: Effect, actor: Actor) => GameEvent[];
  onExpire?: (world: World, effect: Effect, actor: Actor) => GameEvent[];
}

// ──────────────────────────── specs ────────────────────────────

const burning: EffectSpec = {
  kind: "burning",
  defaultDuration: 50,
  defaultMagnitude: 1,
  tickEvery: 10,
  onTick: (_w, eff, actor) => {
    const dmg = eff.magnitude ?? 1;
    actor.hp -= dmg;
    const events: GameEvent[] = [
      { type: "EffectTick", actor: actor.id, kind: "burning", magnitude: dmg },
    ];
    if (actor.hp <= 0 && actor.alive) {
      actor.alive = false;
      events.push({ type: "Died", actor: actor.id });
      if (actor.isHero) {
        events.push({ type: "HeroDied", actor: actor.id });
      }
    }
    return events;
  },
};

const regen: EffectSpec = {
  kind: "regen",
  defaultDuration: 50,
  defaultMagnitude: 2,
  tickEvery: 10,
  // Design choice: at full HP, SKIP the tick (no EffectTick event).
  // Rationale: consumers see ticks only when something happened.
  onTick: (_w, eff, actor) => {
    if (actor.hp >= actor.maxHp) return [];
    const want = eff.magnitude ?? 2;
    const healed = Math.min(want, actor.maxHp - actor.hp);
    actor.hp += healed;
    return [
      { type: "EffectTick", actor: actor.id, kind: "regen", magnitude: healed },
      { type: "Healed", actor: actor.id, amount: healed },
    ];
  },
};

// haste / slow: modifier effects. No onTick — effectiveStats reads them.
// Re-applying the same kind just refreshes duration (rule 3 — magnitude
// doesn't stack). This is fine because the multiplier is baked into the
// spec, not the effect instance.
const haste: EffectSpec = {
  kind: "haste",
  defaultDuration: 50,
  tickEvery: 1,
};

const slow: EffectSpec = {
  kind: "slow",
  defaultDuration: 50,
  tickEvery: 1,
};

// Phase 7: poison — weaker, longer burn. Separate kind so cleanse can remove
// it independently and so the venom_dagger on_hit proc doesn't overwrite a
// target's unrelated burning.
const poison: EffectSpec = {
  kind: "poison",
  defaultDuration: 30,
  defaultMagnitude: 1,
  tickEvery: 15,
  onTick: (_w, eff, actor) => {
    const dmg = eff.magnitude ?? 1;
    actor.hp -= dmg;
    const events: GameEvent[] = [
      { type: "EffectTick", actor: actor.id, kind: "poison", magnitude: dmg },
    ];
    if (actor.hp <= 0 && actor.alive) {
      actor.alive = false;
      events.push({ type: "Died", actor: actor.id });
      if (actor.isHero) events.push({ type: "HeroDied", actor: actor.id });
    }
    return events;
  },
};

// ── Phase 13 effects ──────────────────────────────────────────────────────────

// chill: passive — reduces atk AND speed each by magnitude% (single scalar).
// magnitude = N means N% reduction; default 20. effectiveStats folds both
// through a (1 - pct) multiplier so chill composes with haste/slow cleanly.
const chill: EffectSpec = {
  kind: "chill",
  defaultDuration: 30,
  defaultMagnitude: 20,
  tickEvery: 1,
};

// shock: passive — reduces def by magnitude flat. Clamped to 0 in effectiveStats.
const shock: EffectSpec = {
  kind: "shock",
  defaultDuration: 30,
  defaultMagnitude: 5,
  tickEvery: 1,
};

// expose: passive — incoming physical damage is multiplied by (1 + magnitude%).
// Resolved at damage-apply time in commands.ts doAttack, not in effectiveStats.
// Spell inflict path does not yet honour expose (out of scope for Phase 13.0).
const expose: EffectSpec = {
  kind: "expose",
  defaultDuration: 20,
  defaultMagnitude: 25,
  tickEvery: 1,
};

// might: passive — flat atk bonus folded into effectiveStats.
const might: EffectSpec = {
  kind: "might",
  defaultDuration: 30,
  defaultMagnitude: 3,
  tickEvery: 1,
};

// iron_skin: passive — flat def bonus folded into effectiveStats.
const iron_skin: EffectSpec = {
  kind: "iron_skin",
  defaultDuration: 30,
  defaultMagnitude: 3,
  tickEvery: 1,
};

// mana_regen: restores mp per tick. Skips tick when already at maxMp (same
// design choice as regen-at-full-hp: no noise when nothing changed).
const mana_regen: EffectSpec = {
  kind: "mana_regen",
  defaultDuration: 50,
  defaultMagnitude: 2,
  tickEvery: 10,
  onTick: (_w, eff, actor) => {
    const mp = actor.mp ?? 0;
    const maxMp = actor.maxMp ?? 0;
    if (mp >= maxMp) return [];
    const want = eff.magnitude ?? 2;
    const gained = Math.min(want, maxMp - mp);
    actor.mp = mp + gained;
    return [
      { type: "EffectTick", actor: actor.id, kind: "mana_regen", magnitude: gained },
      { type: "ManaChanged", actor: actor.id, amount: gained },
    ];
  },
};

// mana_burn: drains mp per tick. Skips tick when mp is already 0.
const mana_burn: EffectSpec = {
  kind: "mana_burn",
  defaultDuration: 30,
  defaultMagnitude: 1,
  tickEvery: 10,
  onTick: (_w, eff, actor) => {
    const mp = actor.mp ?? 0;
    if (mp <= 0) return [];
    const drain = Math.min(eff.magnitude ?? 1, mp);
    actor.mp = mp - drain;
    return [
      { type: "EffectTick", actor: actor.id, kind: "mana_burn", magnitude: drain },
      { type: "ManaChanged", actor: actor.id, amount: -drain },
    ];
  },
};

// power: passive — flat int bonus folded into effectiveStats.
const power: EffectSpec = {
  kind: "power",
  defaultDuration: 30,
  defaultMagnitude: 3,
  tickEvery: 1,
};

// shield: damage-absorption pool. magnitude = pool size granted on apply.
// Duration controls when the remaining pool expires (onExpire zeroes shieldHp).
//
// Stacking deviation from Phase-5 standard: shield is a pool, not a modifier,
// so "bigger pool wins" is applied on re-application. If incoming.magnitude >
// existing.magnitude the pool is topped up to the new amount and
// existing.magnitude is updated; smaller incoming leaves the pool unchanged.
// Duration still refreshes to max(existing, new) per standard stacking.
const shield: EffectSpec = {
  kind: "shield",
  defaultDuration: 50,
  defaultMagnitude: 10,
  tickEvery: 1,
  onApply: (_w, eff, actor) => {
    actor.shieldHp = (actor.shieldHp ?? 0) + (eff.magnitude ?? 10);
    return [];
  },
  onStack: (_w, existing, incoming, actor) => {
    const newMag = incoming.magnitude ?? 10;
    if (newMag > (existing.magnitude ?? 0)) {
      actor.shieldHp = newMag;
      existing.magnitude = newMag;
    }
    return [];
  },
  onExpire: (_w, _eff, actor) => {
    actor.shieldHp = 0;
    return [];
  },
};

export const REGISTRY: Record<EffectKind, EffectSpec> = {
  burning, regen, haste, slow, poison,
  chill, shock, expose, might, iron_skin, mana_regen, mana_burn, power, shield,
};

// Load-time validation: every EffectKind must have a REGISTRY entry.
// TypeScript's Record<EffectKind, EffectSpec> enforces this statically;
// this runtime check catches drift from untyped paths (generated content, etc).
((): void => {
  const kinds: EffectKind[] = [
    "burning", "regen", "haste", "slow", "poison",
    "chill", "shock", "expose", "might", "iron_skin",
    "mana_regen", "mana_burn", "power", "shield",
  ];
  for (const k of kinds) {
    if (!REGISTRY[k]) throw new Error(`[effects] REGISTRY missing spec for EffectKind '${k}'`);
  }
})();

// ──────────────────────────── apply ────────────────────────────

function genId(world: World, kind: EffectKind): string {
  const n = (world.effectSeq ?? 0) + 1;
  world.effectSeq = n;
  return `e${n}_${kind}`;
}

export interface ApplyOpts {
  magnitude?: number;
  tickEvery?: number;
  source?: string;
}

export function applyEffect(
  world: World,
  actorId: string,
  kind: EffectKind,
  duration: number,
  opts: ApplyOpts = {},
): GameEvent[] {
  const actor = world.actors.find(a => a.id === actorId);
  if (!actor || !actor.alive) return [];
  const spec = REGISTRY[kind];
  if (!spec) return [];

  const effects = actor.effects ?? (actor.effects = []);
  const existing = effects.find(e => e.kind === kind);
  if (existing) {
    // Standard stacking: refresh remaining to max(existing, incoming). Magnitude
    // does not stack — existing magnitude wins (first-write-wins; keeps identity
    // stable). Shield deviates: see onStack below.
    const newRemaining = Math.max(existing.remaining, duration);
    existing.remaining = newRemaining;
    existing.duration = Math.max(existing.duration, duration);
    const evs: GameEvent[] = [
      { type: "EffectApplied", actor: actor.id, kind, ...(opts.source !== undefined ? { source: opts.source } : {}) },
    ];
    if (spec.onStack) {
      const incomingMag = opts.magnitude ?? spec.defaultMagnitude;
      evs.push(...spec.onStack(world, existing, { magnitude: incomingMag, duration }, actor));
    }
    return evs;
  }

  const eff: Effect = {
    id: genId(world, kind),
    kind,
    target: actor.id,
    magnitude: opts.magnitude ?? spec.defaultMagnitude,
    duration,
    remaining: duration,
    tickEvery: opts.tickEvery ?? spec.tickEvery,
    ...(opts.source !== undefined ? { source: opts.source } : {}),
  };
  effects.push(eff);

  const events: GameEvent[] = [
    { type: "EffectApplied", actor: actor.id, kind, ...(opts.source !== undefined ? { source: opts.source } : {}) },
  ];
  if (spec.onApply) events.push(...spec.onApply(world, eff, actor));
  return events;
}

// ──────────────────────────── tick ────────────────────────────

// Called by the scheduler AFTER each tick's action phase, for each live actor.
export function tickEffects(world: World, actor: Actor): GameEvent[] {
  const effects = actor.effects;
  if (!effects || effects.length === 0) return [];
  if (!actor.alive) return [];

  const out: GameEvent[] = [];
  // Snapshot to avoid mutation surprises mid-iteration.
  const list = [...effects];
  for (const eff of list) {
    if (!actor.alive) break;   // dead actors stop ticking mid-pass
    const spec = REGISTRY[eff.kind];
    if (!spec) continue;

    // Per spec: decrement remaining FIRST, then check tick cadence, then expire.
    // Permanent effects (Infinity) don't decrement and don't expire.
    const permanent = !Number.isFinite(eff.duration);
    if (!permanent) eff.remaining -= 1;

    const elapsed = permanent
      ? (eff as any)._elapsed = ((eff as any)._elapsed ?? 0) + 1
      : eff.duration - eff.remaining;

    if (spec.onTick && elapsed % eff.tickEvery === 0) {
      out.push(...spec.onTick(world, eff, actor));
    }

    if (!permanent && eff.remaining <= 0) {
      if (spec.onExpire) out.push(...spec.onExpire(world, eff, actor));
      out.push({ type: "EffectExpired", actor: actor.id, kind: eff.kind });
      const idx = effects.indexOf(eff);
      if (idx >= 0) effects.splice(idx, 1);
    }
  }
  return out;
}

// ──────────────────────────── stat resolution ────────────────────────────

export interface EffectiveStats {
  hp: number;
  maxHp: number;
  speed: number;
  atk: number;
  def: number;
  mp: number;
  maxMp: number;
  int: number;
}

// Pure fold over active effects + equipment bonuses. Base stats are not
// mutated. Equipment uses monotone-max aggregation (see items/execute.ts).
export function effectiveStats(actor: Actor): EffectiveStats {
  const base: EffectiveStats = {
    hp: actor.hp,
    maxHp: actor.maxHp,
    speed: actor.speed,
    atk: actor.atk ?? 0,
    def: actor.def ?? 0,
    mp: actor.mp ?? 0,
    maxMp: actor.maxMp ?? 0,
    int: actor.int ?? 0,
  };
  // Equipment bonuses — injected by items/execute.ts at module load time
  // (see wireEquipmentBonuses). Monotone-max aggregation per stat.
  if (actor.inventory && _equipmentBonuses) {
    const bonuses = _equipmentBonuses(actor);
    if (bonuses.atk)   base.atk   += bonuses.atk;
    if (bonuses.def)   base.def   += bonuses.def;
    if (bonuses.int)   base.int   += bonuses.int;
    if (bonuses.maxHp) base.maxHp += bonuses.maxHp;
    if (bonuses.maxMp) base.maxMp += bonuses.maxMp;
    if (bonuses.speed) base.speed += bonuses.speed;
  }

  const effects = actor.effects ?? [];

  // Collect multipliers and flat deltas in one pass, then apply.
  // Order: flat deltas first (so chill's atk-mul applies to might-boosted atk).
  let speedMul = 1;
  let atkMul = 1;
  let atkDelta = 0;
  let defDelta = 0;
  let intDelta = 0;

  for (const e of effects) {
    const mag = e.magnitude ?? 0;
    switch (e.kind) {
      case "haste":     speedMul *= 1.5; break;
      case "slow":      speedMul *= 0.5; break;
      case "chill": {
        // chill.magnitude = N → N% reduction to both speed and atk.
        const pct = mag / 100;
        speedMul *= (1 - pct);
        atkMul   *= (1 - pct);
        break;
      }
      case "shock":     defDelta -= mag; break;
      case "might":     atkDelta += mag; break;
      case "iron_skin": defDelta += mag; break;
      case "power":     intDelta += mag; break;
      // expose, mana_regen, mana_burn, shield, burning, regen, poison:
      // no effectiveStats contribution.
    }
  }

  // Apply flat deltas, then multipliers.
  if (atkDelta !== 0) base.atk = Math.max(0, base.atk + atkDelta);
  if (defDelta !== 0) base.def = Math.max(0, base.def + defDelta);
  if (intDelta !== 0) base.int += intDelta;
  if (speedMul !== 1) base.speed = Math.max(1, Math.floor(base.speed * speedMul));
  if (atkMul   !== 1) base.atk   = Math.max(0, Math.floor(base.atk * atkMul));

  return base;
}

// Equipment-bonus injection: items/execute.ts calls wireEquipmentBonuses at
// module load. Kept as a one-way hook to avoid a hard effects→items import,
// since execute.ts already imports applyEffect from here.
type StatBonuses = Partial<Record<"atk" | "def" | "int" | "speed" | "maxHp" | "maxMp", number>>;
let _equipmentBonuses: ((a: Actor) => StatBonuses) | null = null;
export function wireEquipmentBonuses(fn: (a: Actor) => StatBonuses): void {
  _equipmentBonuses = fn;
}

export function hasEffect(actor: Actor, kind: string): boolean {
  const effects = actor.effects ?? [];
  return effects.some(e => e.kind === kind);
}

export function listEffects(actor: Actor): string[] {
  const effects = actor.effects ?? [];
  return effects.map(e => e.kind);
}
