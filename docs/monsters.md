# Monsters

Monsters in Grimoire are **data**, not code. Each entry in `MONSTER_TEMPLATES`
(see [src/content/monsters.ts](../src/content/monsters.ts)) is a plain record
with stats, a sprite key, optional spells/loot, and a DSL AI script written in
the same language the player edits. The script is parsed once at module load;
a parse error there is a dev-time hard fail, not a runtime bug.

All monster spawns go through `createActor(templateId, pos, id)` — do not
hand-build `Actor` objects. The factory stamps the template onto a fresh actor
with `isHero: false`, attaches the cached AST, copies `knownSpells`, and wires
the loot-table key for [`rollDeathDrops`](../src/items/loot.ts).

## Adding a new monster

1. Write the AI script as a template string at the top of
   [src/content/monsters.ts](../src/content/monsters.ts). Keep it short (≤15
   lines) and readable — these are copy-paste fodder for kids learning the DSL.
2. Append a `MonsterTemplate` entry to `RAW_TEMPLATES`:

   ```ts
   {
     id: "wolf",
     name: "Wolf",
     visual: "wolf",                 // key into MONSTER_RENDERERS
     stats: { hp: 6, maxHp: 6, speed: 14, atk: 2 },
     ai: WOLF_AI,
     loot: "wolf_loot",              // optional — key into LOOT_TABLES
   }
   ```

3. If the monster has loot, add a `wolf_loot` entry to `LOOT_TABLES` in
   [src/content/loot.ts](../src/content/loot.ts). Monsters without loot (e.g.
   the bat) simply omit the field.
4. If the monster has spells, populate `knownSpells` on the template. The
   runtime reads actor-level `knownSpells`; the factory copies the array.
5. Make sure `visual` matches a real sprite key. When no match is found the
   renderer falls back to the `"skeleton"` sprite, which is fine for early
   iteration but should be fixed before shipping.

The registry is frozen at module load, so there's no need (or way) to mutate
it at runtime.

## Phase 14: families, immunities, scaling

Each `MonsterTemplate` now carries a **family** axis and a tier **level**.

### Family

`family` is one of `undead | beast | humanoid | elemental | construct | demon`. Used by future loot/biome systems and as a thematic grouping for immunities.

### Immunities

`immunities?: EffectKind[]` declares effect kinds that the monster silently rejects. The `Hit` event from `project` / `explode` still lands — only the *effect attachment* (burning, poison, chill, …) is suppressed. Implementation: `applyEffect` short-circuits early when the kind is in `actor.immunities`. Damage from clouds applies via the per-tick path which is also gated.

Common patterns:
- Undead: `["poison", "mana_burn"]` (and often `chill` for high-tier).
- Constructs: `["chill", "poison", "burning"]`.
- Elementals: usually immune to their own element.

### Defense semantics

`def` reduces incoming **melee damage only**. Spell damage (`project`/`explode`/`inflict` damage tick) bypasses `def` entirely — the spec choice is to keep magic as the universal antidote. This is why the Ghost can run with `def: 8` and still die quickly to a `bolt`.

### Level scaling

Templates declare stats at level-1 baseline. At spawn, `createActor()` applies:

```ts
function scaleByLevel(base: number, level: number): number {
  return Math.floor(base * (1 + 0.15 * (level - 1)));
}
```

…to `hp / maxHp / mp / maxMp / atk / def / int`. **`speed` is not scaled.** Neither is `family` or `immunities`. So a `dragon` (level 10, base hp 100) spawns with hp 235, but its speed stays at the declared 9.

### Reserved boss flag

`boss?: boolean` is added to MonsterTemplate but currently has no behaviour wired up. A later phase introduces boss rooms with special encounters; this flag is the marker.

### `tint` field

`tint?: Record<string, string>` is a render-color override merged into `actor.colors` at spawn (existing renderer plumbing). Used for variant skins of shared sprites — e.g. `lesser_slime` reuses the slime sprite with a paler body color.

### `startingInventory`

Monsters can spawn carrying consumables (`{ itemId, count? }[]`). Their AI scripts can `use("might_potion")` — the same `use()` command the hero uses. To prevent these monster-affinity items from leaking into player loot tables in future phases, set `playerLootable: false` on the `ItemDef`.

## AI archetype catalog

Reusable DSL turn-loops live in [src/content/ai-archetypes.ts](../src/content/ai-archetypes.ts). Templates set `aiArchetype: "name"` and optionally `aiVars: { SPELL: "firebolt" }` to substitute placeholders. The resolved source is parsed once at module load and backfilled into `tpl.ai` so the help catalog reads it like any other DSL string.

| archetype          | shape                                                      |
|--------------------|------------------------------------------------------------|
| `melee_chase`      | step toward foe, attack adjacent. Reference AI.            |
| `melee_chase_flee` | melee_chase, but flee below 30% hp.                        |
| `hit_and_run`      | adjacent → attack → step away one tile.                    |
| `slow_chase`       | melee_chase; pass when path blocked rather than thrash.    |
| `kite_and_cast`    | cast `__SPELL__` while in range, maintain ~3 tiles.        |
| `stationary_caster`| never moves; cast or pass.                                 |
| `erratic_caster`   | random pick of 3 spells per turn.                          |
| `regen_brute`      | melee + chance(40) self-cast `__SPELL__`.                  |
| `aura_brawler`     | chance(70) self-cast aura pulse + melee.                   |
| `mushroom_passive` | stationary; `on hit` handler casts `poison_cloud` at self. |
| `dragon_breath`    | counter local; every 3rd turn cast `fireball`.             |
| `lich_caster`      | kite with chance(60) cast gate + 5% notify flavour.        |

For one-off behaviour (vampire, knight with two-stage potions, etc.) the template uses `ai: "..."` with a raw DSL string. The resolution rule is: `ai` overrides `aiArchetype`.

### Notify flavour

Intelligent monsters (lich, dark wizard, vampire, dragon, cultist, mage) get a `chance(5)` `notify(...)` line each turn that picks from a 2-line bank. Dumb monsters stay silent. All `chance()` / `random()` calls go through `world.rng` for determinism.

## On-death procs

Templates can declare `onDeath?: { summon?: { template, count } }`. The scheduler fires the proc after the `Died` event and before `appendDeathDrops`. Currently used for slime split (2× `lesser_slime`). Spawned summons are flagged `summoned: true` (skips loot) but their `owner` is left blank so the death-cascade despawn pass doesn't immediately kill them. `lesser_slime` deliberately does not declare its own `onDeath` — split is one-shot.

## Starter roster (Phase 11)

| id       | role               | notes                                               |
|----------|--------------------|-----------------------------------------------------|
| goblin   | fast melee         | Approach + attack loop — the reference AI.          |
| skeleton | armored melee      | Uses `adjacent(me, foe)` to skip redundant moves; flees below 3 HP. |
| bat      | hit-and-run        | Attacks when adjacent, then flees the same tick. No loot. |
| cultist  | caster             | Casts `bolt` while in range + has MP; `on hit` handler flees attacker. |
| slime    | slow, beefy, dumb  | Walk-and-swing only — good first read for new DSL users. |

## AI authoring notes

- The main script and `on <event>` handlers share the same DSL. Handlers fire
  even after the main has halted — see [engine-design.md § Termination](engine-design.md#termination-conditions).
  The cultist's `on hit as attacker: flee(attacker)` block relies on this.
- Randomness belongs to the scheduler — AIs should not branch on `Math.random`
  or any external state. Use queries (`enemies()`, `adjacent`, `can_cast`,
  `hp()`) so the monster's behavior is fully determined by world state.
- Room generation spawns two monsters per level via a seeded mulberry32 stream
  derived from the level number; see
  [src/content/rooms.ts](../src/content/rooms.ts). There is no `Math.random`
  in the monster or room code.
