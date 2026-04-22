// Stub: true if any active effect is attached to / targeting this entity.
// Used by renderer.js to decide whether to keep drawing a recently-dead
// monster so its attached death FX animation still plays out.
export function hasActiveEffectFor(state, id) {
  const eff = state.activeEffects;
  if (!eff || !eff.length) return false;
  for (const e of eff) {
    if (e.attachTo === id) return true;
    if (e.targetId === id) return true;
    if (Array.isArray(e.targetIds) && e.targetIds.includes(id)) return true;
  }
  return false;
}
