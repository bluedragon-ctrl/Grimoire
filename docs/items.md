# Grimoire Items

Data-driven item system. Every item is a registry entry (`ItemDef`) with one of three kinds: `consumable`, `equipment`, or `scroll`. Scripts may use consumables and pick up equipment, but the UI is the only thing that equips wearables.

## File map

| Path                             | Role                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| `src/types.ts`                   | `ItemInstance`, `Slot`, `Inventory`, `ItemDef`, `ProcSpec`, `AuraSpec` |
| `src/content/items.ts`           | `ITEMS` registry, `BAG_SIZE`, `SLOTS`                       |
| `src/content/item-visuals.ts`    | `ITEM_VISUAL_PRESETS` (renderer)                            |
| `src/items/execute.ts`           | `useItem`, `equipItem`, `unequipItem`, proc hooks, aura lifecycle, equipment-bonus folding |
| `src/items/loot.ts`              | Death drops, floor items, pickup/drop overflow              |

## ItemDef shape

```ts
interface ItemDef {
  id: string; name: string; description: string;
  kind: "consumable" | "equipment" | "scroll";
  level: number;
  // equipment-only
  slot?: Slot;
  bonuses?:   Partial<Record<StatKey, number>>;  // additive stat bonuses
  on_hit?:    ProcSpec;   // after this wearer lands a melee hit
  on_damage?: ProcSpec;   // after this wearer takes melee damage
  on_kill?:   ProcSpec;   // when this wearer's hit (or DoT tick) kills the target
  on_cast?:   ProcSpec;   // after this wearer successfully casts a spell
  aura?:      AuraSpec;   // continuous effect while equipped
  // consumable-only
  useTarget?: "self" | "ally" | "enemy" | "tile";
  range?: number;
  body?: SpellOp[];       // dispatched through PRIMITIVES at use-time
  polarity?: "buff" | "debuff";
  // scroll-only
  spell?: string;
}
```

`Slot` is one of `hat | robe | staff | dagger | focus`.

## Consumables

Consumables dispatch a `body: SpellOp[]` through the same `PRIMITIVES` registry as spells. The UI does not invoke them — the script does, via `use()`.

- Script call: `use(itemRef)` — `itemRef` may be an `ItemInstance` from `actor.inventory.consumables`, a bare `defId` string (resolves to the first matching instance in the bag), or a tuple including a target.
- Cost: **15 energy** (matches `cast`).
- Pre-spend gate order in `doUse` mirrors `castSpell`:
  1. Resolve item instance from ref. Bag empty / wrong kind / unknown id → `ActionFailed`.
  2. Faction gate (`useTarget === "ally"` requires same faction; `"enemy"` opposing).
  3. Range gate (Chebyshev ≤ `def.range`).
  4. LOS gate (smoke clouds block non-self, non-adjacent targets).
  5. Blinded gate (caster with `blinded` cannot reach beyond Chebyshev 1).
- Only after all gates pass is the item removed from the bag and `body` dispatched. Failed `use` refunds energy — same starvation-prevention policy as failed casts.
- Success emits `ItemUsed`.

Notable consumable-only primitives:

- **`cleanse`** removes all effects whose `polarity === "debuff"`, leaving buffs intact. Effects sourced from equipped items (`source.type === "item"`) are immune.
- **`permanent_boost`** permanently increments a base stat (`hp`/`mp`/`atk`/`def`/`speed`/`int`); `hp`/`mp` raise both the current value and the cap.

## Equipment (wearables)

Equipment is structured data — there is no per-item script. All behavior is declared via `bonuses`, the four proc hooks (`on_hit` / `on_damage` / `on_kill` / `on_cast`), and `aura`.

### Bonuses are additive

`getEquipmentBonuses(actor)` sums `bonuses` across every equipped slot. Two items with `def: 3` give **+6 def, not +3**. `effectiveStats(actor)` folds the sum on top of the actor's base stats before haste/slow multipliers apply.

The `permanent_boost` consumable primitive is the escape hatch for permanent base-stat bumps (elixirs); those persist across equips and saves.

### Proc hooks

All four proc hooks share `fireProcSpec(world, wearer, proc, target, defId)`:

1. **Chance gate.** If `proc.chance` is defined, advance the world RNG once and gate on `roll * 100 < chance`. The RNG step happens whether or not the proc fires (deterministic replay).
2. **Target resolution.** `"self"` → wearer; `"attacker"` → entity that dealt damage to wearer; `"victim"` → entity wearer just hit.
3. **Effect.** If `proc.effect` is defined, `applyEffect` runs on the resolved target.
4. **Damage / heal.** Positive `proc.damage` deals damage (min 1 after defense) and emits `Hit { fromProc: true }`. Negative `proc.damage` heals (clamped to maxHp) and emits `Healed`.

| Hook        | Trigger                                                                |
|-------------|------------------------------------------------------------------------|
| `on_hit`    | After a melee attack lands (`doAttack`, target hit)                    |
| `on_damage` | After the wearer takes melee damage from any attacker                  |
| `on_kill`   | When a melee hit or DoT tick kills the target                          |
| `on_cast`   | After the wearer successfully casts a spell (excludes `ActionFailed`)  |

**Loop guard.** Proc damage emits `Hit { fromProc: true }`. `onDamageHook` returns `[]` immediately when called with `fromProc`, preventing infinite proc-vs-proc chains.

**DoT kill attribution.** When `burning` or `poison` ticks kill an actor, the killer is the actor whose id is stored in `effect.source.id`. `effects.ts` exposes `wireOnKillHook(fn)` and `callOnKillHook()`; `execute.ts` registers the implementation at module load to avoid a circular import.

### Auras

An `aura: AuraSpec` is a continuous effect that lives exactly as long as the item is equipped:

1. **Equip** — `applyEffect(world, actor, aura.kind, Infinity, { source: { type: "item", id: defId } })`. `Infinity` duration signals a permanent-until-unequip effect.
2. **Unequip** — `removeItemEffects(world, actor, defId)` strips every effect whose `source.type === "item" && source.id === defId`.
3. **Swap** — the old item's aura is removed before the new item's aura is applied; no gap, no double-application.
4. **Cleanse immunity** — the `cleanse` primitive skips any effect with `source.type === "item"`.

`Effect.source` is a tagged union `{ type: "actor" | "item"; id: string }` so the engine can distinguish combat-inflicted effects from equipment-granted ones.

### Equip / unequip events

- **Slot conflict.** Equipping into a filled slot swaps: previously-equipped item returns to the bag, incoming item takes the slot. Both `ItemUnequipped` and `ItemEquipped` fire.
- **Bag overflow.** If the bag is full, the displaced item lands at the actor's tile with `ItemDropped { source: "overflow" }`.
- **Scripts cannot equip.** Only the UI calls `equipItem` / `unequipItem`.

## Scrolls

Scrolls carry a `spell: string` field. They are consumed automatically at room exit, before `HeroExited` fires:

- If the spell is **not** in `hero.knownSpells`: add it, emit `SpellLearned`, emit `ScrollDiscarded(reason: "learned")`.
- If the spell is **already known**: emit `ScrollDiscarded(reason: "duplicate")`.
- All scroll instances are removed from the bag in either case.

If `doExit` returns `ActionFailed` (not on a door tile), the bag is unchanged.

## Adding a new item

1. Add an `ItemDef` to `ITEMS` in [src/content/items.ts](../src/content/items.ts). Set `kind`, then the kind-specific fields.
2. Add (or rely on type fallback of) an entry in `ITEM_VISUAL_PRESETS`.
3. Registry validation (`parseAllItems` for legacy scripts, `validateAllWearables` for proc/aura/bonus shape) runs at module load and fails the suite on bad content.

## Events

| Event             | Payload                                                                |
|-------------------|------------------------------------------------------------------------|
| `ItemUsed`        | `{ actor, item, defId }`                                               |
| `ItemEquipped`    | `{ actor, item, defId, slot }`                                         |
| `ItemUnequipped`  | `{ actor, item, defId, slot }`                                         |
| `OnHitTriggered`  | `{ attacker, defender, item, defId }`                                  |
| `Hit`             | `{ ..., fromProc?: true }` — proc-sourced melee damage                 |
| `ItemDropped`     | `{ actor, item, defId, pos, source }` — `source ∈ {"death","drop","overflow"}` |
| `ItemPickedUp`    | `{ actor, item, defId, pos }`                                          |
| `SpellLearned`    | `{ actor, spell }` — emitted on scroll auto-consume                    |
| `ScrollDiscarded` | `{ actor, defId, reason }` — `reason ∈ {"learned","duplicate"}`        |

## Loot and pickups

Monsters drop items on death, items sit on the floor, and the hero's script can `pickup()` them. All randomness is threaded through the engine's mulberry32 RNG (`src/rng.ts`, seeded from `RunOptions.seed`).

### Loot tables

`src/content/loot.ts` exports `LOOT_TABLES`, keyed by actor kind. Each entry is one independent roll:

```ts
export const LOOT_TABLES: Record<string, LootEntry[]> = {
  goblin_loot: [
    { defId: "health_potion", chance: 0.5 },
  ],
};
```

When an actor dies (`Died` from any path — attacks, cloud burn, poison tick) the scheduler calls `rollDeathDrops(world, actor)`. Each entry rolls independently against `worldRandom`; on a hit the engine mints `min..max` fresh `FloorItem` instances at the victim's tile, emitting one `ItemDropped` event per instance with `source: "death"`. Templates must declare a `loot` key explicitly — there is no `actor.kind` fallback.

Summoned actors (`actor.summoned === true`) skip `rollDeathDrops` entirely.

### Commands

| Call                   | Cost | Behavior                                                              |
| ---------------------- | ---: | --------------------------------------------------------------------- |
| `pickup()`             |  10  | Take the topmost floor item on the hero's tile into the bag.          |
| `pickup(item)`         |  10  | Targeted pickup — accepts a bare `defId` or an `items_here()` ref.    |
| `drop(slot_or_item)`   |   5  | Pull a consumable out of the bag and leave it on the hero's tile.     |

`pickup` fails with `ActionFailed { reason: "Bag full" }` if the bag is at `BAG_SIZE` — the item stays on the floor. Failed pickups/drops refund energy.

### Queries (zero cost)

- `items_here()` — `FloorItem[]` on the hero's tile, **topmost first** (LIFO; matches what `pickup()` without args would take).
- `items_nearby(r?)` — Manhattan-sorted list within radius `r` (default 4).

### Bag-full overflow

Unequipping into a full bag, equip-swap displacement, and any future loot-grant path all route the displaced item through the same drop mechanism: the item lands at the actor's feet with `ItemDropped { source: "overflow" }`. Every item either enters an inventory or appears on the floor.

### Tick ordering

Loot rolls happen **inside** the step that emitted the death, not on a later tick. `stepOne` appends drops to the event bundle after `fireAction` and after the tick-effect/cloud phase, so a single returned `StepResult.events` carries `Died → ItemDropped{...}` in order. Handlers that care can subscribe through normal dispatch.

### Renderer

`WireRendererAdapter` adds the new item to `VisualState.floorItems` on `ItemDropped` (with a small burst at the tile) and removes it on `ItemPickedUp` (with a sparkling overlay on the hero). The `type` passed to the vendor `drawItem()` is the `defId` — registry entries render out of the box.
