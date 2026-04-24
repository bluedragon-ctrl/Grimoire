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
