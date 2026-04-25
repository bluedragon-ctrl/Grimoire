// CLOUD_KINDS — data dict mapping cloud kind to the effect re-applied to any
// actor standing on the cloud tile each scheduler tick. Extensible later;
// adding a new cloud kind here (with an existing EffectKind) requires no
// engine change.

import type { EffectKind } from "../types.js";

export interface CloudKindSpec {
  // Effect re-applied while an actor stands on the cloud tile.
  // duration here is the effect's duration per re-application, not the cloud's.
  effect: { kind: EffectKind; duration: number };
  // Default visual preset (key into CLOUD_PRESETS). Used when a CloudSpawned
  // event carries no explicit visual field — e.g. clouds spawned by monsters.
  visual: string;
}

export const CLOUD_KINDS: Record<string, CloudKindSpec> = {
  fire:   { effect: { kind: "burning", duration: 10 }, visual: "cloud_fire"   },
  frost:  { effect: { kind: "slow",    duration: 10 }, visual: "cloud_frost"  },
  poison: { effect: { kind: "poison",  duration: 10 }, visual: "cloud_poison" },
  // Smoke clouds block line-of-sight and blind actors standing on their tile.
  // Duration 1 = lasts exactly one tick; the cloud itself persists until it
  // expires — blinded is refreshed while the actor remains inside.
  smoke:  { effect: { kind: "blinded", duration: 1  }, visual: "cloud_smoke"  },
};
