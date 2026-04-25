// Phase 14: reusable monster AI archetypes.
//
// Each export below is a complete DSL turn-loop ready to drop into a
// MonsterTemplate's `aiArchetype` field. Keep each script under ~30 lines
// and prefer Phase 13.5 Pythonic syntax (def/lambdas, dot-walk on actors,
// collection methods, break/continue/pass).
//
// The library favours readability over cleverness: these scripts are
// copy-paste fodder for kids learning the DSL, just like the Phase 11
// roster. Templates extend an archetype simply by referencing the name
// here; per-monster spell choices and notify flavour live on the template.
//
// Determinism: every chance()/random() call goes through world.rng — the
// queries layer wires that up, so DSL authors don't think about it.
// chance(p) takes p in 0–100 (percent), NOT 0–1.

// melee_chase — step toward foe, attack if adjacent. The reference AI.
export const MELEE_CHASE = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// melee_chase_flee — same as melee_chase but flees when wounded below 30%.
// Threshold is checked each iteration so a topped-up brute charges back in.
export const MELEE_CHASE_FLEE = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.hp * 10 < me.maxHp * 3:
    flee(foe)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// hit_and_run — adjacent → attack → step away one tile. Bats, etc.
export const HIT_AND_RUN = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.adjacent_to(foe):
    attack(foe)
    flee(foe)
  else:
    approach(foe)
halt
`;

// slow_chase — like melee_chase but waits when path is blocked rather than
// thrashing. Used by snail/zombie/golem/earth_elemental.
export const SLOW_CHASE = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.adjacent_to(foe):
    attack(foe)
  else:
    if not approach(foe):
      wait()
halt
`;

// kite_and_cast — keep ~3 tiles away from the foe; cast when in range.
// Falls back to melee swing if the foe somehow closes inside the kite.
// SPELL placeholder is replaced at template-load time.
export const KITE_AND_CAST = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.can_cast("__SPELL__", foe):
    cast("__SPELL__", foe)
  elif me.distance_to(foe) <= 2:
    flee(foe)
  else:
    approach(foe)
halt
`;

// stationary_caster — never moves; casts at hero in range, else passes.
// Kept distinct from kite so the mushroom can sit and seethe.
export const STATIONARY_CASTER = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.can_cast("__SPELL__", foe):
    cast("__SPELL__", foe)
  else:
    pass
  wait()
halt
`;

// erratic_caster — pick from a 3-spell rotation by a uniform random index.
// Falls back to approach if none are castable. Dark wizards / mages.
export const ERRATIC_CASTER = `
while len(enemies()) > 0:
  foe = enemies()[0]
  pick = random(3)
  if pick == 0 and me.can_cast("__SPELL_A__", foe):
    cast("__SPELL_A__", foe)
  elif pick == 1 and me.can_cast("__SPELL_B__", foe):
    cast("__SPELL_B__", foe)
  elif pick == 2 and me.can_cast("__SPELL_C__", foe):
    cast("__SPELL_C__", foe)
  elif me.distance_to(foe) <= 2:
    flee(foe)
  else:
    approach(foe)
halt
`;

// regen_brute — like melee_chase but periodically self-heals via cast.
// chance(40) gates the cast so the troll isn't permanently over-tanky.
// SPELL placeholder usually points at a self-buff regen spell.
export const REGEN_BRUTE = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if me.hp < me.maxHp and chance(40) and me.can_cast("__SPELL__", me):
    cast("__SPELL__", me)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// aura_brawler — each turn chance(70) cast the aura pulse, then melee.
// SPELL is the aura pulse name (fire_aura_pulse / frost_aura_pulse).
export const AURA_BRAWLER = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(70) and me.can_cast("__SPELL__", me):
    cast("__SPELL__", me)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// mushroom_passive — never moves. on_damage handler drops a poison cloud.
// Main loop just idles so handlers get tick budget.
export const MUSHROOM_PASSIVE = `
while len(enemies()) > 0:
  wait()
halt

on hit as attacker:
  if me.can_cast("poison_cloud", me):
    cast("poison_cloud", me)
`;

// dragon_breath — every 3rd turn cast fireball at the foe; otherwise
// melee_chase. Counter is a script-local that persists across iterations.
export const DRAGON_BREATH = `
counter = 0
while len(enemies()) > 0:
  foe = enemies()[0]
  counter = counter + 1
  if counter % 3 == 0 and me.can_cast("fireball", foe):
    cast("fireball", foe)
  elif me.adjacent_to(foe):
    attack(foe)
  else:
    approach(foe)
halt
`;

// lich_caster — kite_and_cast with a 60% cast gate (lich nukes only on
// most turns) and rare flavour notifies on a 5% chance.
// FLAVOUR_PICK is a comma-free random index; the templates substitute the
// notify lines via __FLAVOUR_N__ markers.
export const LICH_CASTER = `
while len(enemies()) > 0:
  foe = enemies()[0]
  if chance(5):
    pick = random(2)
    if pick == 0:
      notify("__FLAVOUR_0__")
    else:
      notify("__FLAVOUR_1__")
  if chance(60) and me.can_cast("__SPELL_A__", foe):
    cast("__SPELL_A__", foe)
  elif chance(60) and me.can_cast("__SPELL_B__", foe):
    cast("__SPELL_B__", foe)
  elif me.distance_to(foe) <= 2:
    flee(foe)
  else:
    approach(foe)
halt
`;

// Registry — keeps lookup explicit for monsters.ts validation.
export const AI_ARCHETYPES: Record<string, string> = {
  melee_chase:        MELEE_CHASE,
  melee_chase_flee:   MELEE_CHASE_FLEE,
  hit_and_run:        HIT_AND_RUN,
  slow_chase:         SLOW_CHASE,
  kite_and_cast:      KITE_AND_CAST,
  stationary_caster:  STATIONARY_CASTER,
  erratic_caster:     ERRATIC_CASTER,
  regen_brute:        REGEN_BRUTE,
  aura_brawler:       AURA_BRAWLER,
  mushroom_passive:   MUSHROOM_PASSIVE,
  dragon_breath:      DRAGON_BREATH,
  lich_caster:        LICH_CASTER,
};

// Helper: substitute __SPELL__ / __SPELL_A__ / __SPELL_B__ / __SPELL_C__
// and __FLAVOUR_0__ / __FLAVOUR_1__ placeholders. Returns a fresh string;
// the caller parses it through the existing DSL pipeline.
export function instantiateArchetype(
  name: string,
  vars: Record<string, string>,
): string {
  const src = AI_ARCHETYPES[name];
  if (!src) throw new Error(`unknown AI archetype '${name}'`);
  let out = src;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`__${k}__`).join(v);
  }
  return out;
}
