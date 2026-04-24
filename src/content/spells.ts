// SPELLS dict — data-only. Engine reads bodies via PRIMITIVES registry.
// Adding a new spell here (with primitives that already exist) requires no
// engine changes.

import type { PrimitiveName } from "../spells/primitives.js";

export type SpellTargetType = "self" | "ally" | "enemy" | "any" | "tile";

export interface SpellOp {
  op: PrimitiveName;
  args: Record<string, unknown>;
}

export interface Spell {
  name: string;
  description: string;
  targetType: SpellTargetType;
  range: number;      // Chebyshev distance
  mpCost: number;
  body: SpellOp[];
}

export const SPELLS: Record<string, Spell> = {
  bolt: {
    name: "bolt",
    description: "A simple arcane bolt.",
    targetType: "enemy", range: 6, mpCost: 5,
    body: [{ op: "project", args: { damage: 4, visual: "bolt_orange", element: "arcane" } }],
  },
  heal: {
    name: "heal",
    description: "Restores an ally's health.",
    targetType: "ally", range: 1, mpCost: 5,
    body: [{ op: "heal", args: { amount: 5, visual: "bolt_green", element: "arcane" } }],
  },
  firebolt: {
    name: "firebolt",
    description: "A blazing bolt that burns its target.",
    targetType: "enemy", range: 6, mpCost: 8,
    body: [
      { op: "project", args: { damage: 3, visual: "bolt_red", element: "fire" } },
      { op: "inflict", args: { kind: "burning", duration: 30 } },
    ],
  },
  chill: {
    name: "chill",
    description: "A chilling beam that slows its target.",
    targetType: "enemy", range: 5, mpCost: 6,
    body: [
      { op: "project", args: { damage: 2, visual: "beam_frost", element: "frost" } },
      { op: "inflict", args: { kind: "slow", duration: 30 } },
    ],
  },
  bless: {
    name: "bless",
    description: "Hastens an ally.",
    targetType: "ally", range: 1, mpCost: 7,
    body: [{ op: "inflict", args: { kind: "haste", duration: 40, visual: "bolt_gold", element: "arcane" } }],
  },
  firewall: {
    name: "firewall",
    description: "Spawns a fire cloud on a tile.",
    targetType: "tile", range: 4, mpCost: 10,
    body: [{ op: "spawn_cloud", args: { kind: "fire", duration: 50, visual: "cloud_fire", element: "fire" } }],
  },
};
