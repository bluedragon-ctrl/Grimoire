// CLOUD_KINDS — data dict mapping cloud kind to the effect re-applied to any
// actor standing on the cloud tile each scheduler tick. Extensible later;
// adding a new cloud kind here (with an existing EffectKind) requires no
// engine change.

import type { EffectKind } from "../types.js";

export interface CloudKindSpec {
  // Effect re-applied while an actor stands on the cloud tile.
  // duration here is the effect's duration per re-application, not the cloud's.
  effect: { kind: EffectKind; duration: number };
}

export const CLOUD_KINDS: Record<string, CloudKindSpec> = {
  fire:  { effect: { kind: "burning", duration: 10 } },
  frost: { effect: { kind: "slow",    duration: 10 } },
};
