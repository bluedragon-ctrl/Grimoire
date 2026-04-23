# Grimoire Items (Phase 7)

Data-driven item system parallel to Phase 6 spells. An item is a registry
entry (`ItemDef`) with a tiny script describing its behavior. Consumables are
invoked via the `use(item)` script builtin; wearables are equipped/unequipped
by the UI (Phase 8) — scripts cannot equip.

## File map

| Path                             | Role                                           |
| -------------------------------- | ---------------------------------------------- |
| `src/types.ts`                   | `ItemInstance`, `Slot`, `Inventory`, `ItemDef` |
| `src/content/items.ts`           | `ITEMS` registry, `BAG_SIZE`, `SLOTS`          |
| `src/content/item-visuals.ts`    | `ITEM_VISUAL_PRESETS` (Phase 8 renderer only)  |
| `src/items/script.ts`            | Parser → typed `ItemOp[]`                      |
| `src/items/execute.ts`           | `useItem`, `equipItem`, `unequipItem`, `onHitHook` |

## Grammar

Newline-separated statements; whitespace-separated tokens. Blank lines and
`#`-prefixed lines are skipped. Errors throw `ParseError` with the item id
and 1-based line number.

| Op        | Form                                      | Scope      |
| --------- | ----------------------------------------- | ---------- |
| `apply`   | `apply <effectId> <duration>`             | consumable |
| `restore` | `restore <hp\|mp> <N>`                    | consumable |
| `cleanse` | `cleanse <effectId>`                      | consumable |
| `modify`  | `modify <stat> <N>` (permanent base bump) | consumable |
| `merge`   | `merge <stat> <N>` (monotone-max)         | wearable   |
| `on_hit`  | `on_hit inflict <effectId> $TARGET <dur> $L` | wearable (dagger) |

Valid effects: `burning`, `regen`, `haste`, `slow`, `poison`. Valid merge
stats: `atk`, `def`, `int`, `speed`, `maxHp`, `maxMp`. Placeholders `$TARGET`
and `$L` are literal tokens — `$L` is reserved (item-level scaling beyond 1
is deferred post-Phase 8).

## Execution model

### Consumables (`use(item)`)

- Script-exposed: `use(itemRef)` — `itemRef` may be an `ItemInstance` from
  `actor.inventory.consumables` or a bare `defId` string (resolves to the
  first matching instance in the bag).
- Cost: **15 energy** (matches spell cast).
- Failure (bag empty, wrong category, unknown id) emits a single
  `ActionFailed`; the scheduler refunds the energy, mirroring the failed-cast
  policy so the actor retries next tick instead of stalling.
- On success: runs every `ItemOp` in order, removes the instance from the bag,
  emits `ItemUsed`.

### Wearables (`equipItem` / `unequipItem`)

- **Not** exposed to scripts — only the UI calls these. Each takes the world
  purely for event emission; no world mutation besides actor inventory.
- Slot conflict: equipping into a filled slot swaps — the previously-equipped
  item goes back to the bag, the incoming item takes its slot, and both
  `ItemUnequipped` and `ItemEquipped` events are emitted.
- Unequip returns the instance to the bag (dropped silently if the bag is
  full; UI enforces real bag-size limits).

### On-hit proc

`doAttack` calls `onHitHook` after the hit resolves. If the attacker has a
dagger equipped with `on_hit_inflict` ops, each fires one `OnHitTriggered`
event plus the effect's `EffectApplied`. Procs are skipped when the defender
died from the strike.

## Merge aggregation vs. effect stacking

These two look similar but use opposite rules — don't confuse them.

| Mechanism       | Source                         | Per-stat rule                     |
| --------------- | ------------------------------ | --------------------------------- |
| `merge` ops     | equipped wearables             | **monotone-max** (highest wins)   |
| effect stacks   | `applyEffect` (spells, potions) | refresh `remaining` to max; magnitude doesn't stack |

Two items with `merge int 2` give **+2 int, not +4**. This is deliberate: it
keeps itemization additive-by-upgrade ("better hat" replaces, not compounds)
without per-slot bookkeeping. `effectiveStats(actor)` folds the monotone-max
bonuses on top of base stats before haste/slow multipliers apply.

The `modify` op is the escape hatch for permanent additive bumps (elixirs):
`modify atk 1` adds 1 to `actor.atk` when the consumable is used, persisting
across equips and saves.

## Adding a new item

1. Add an `ItemDef` to `ITEMS` in `src/content/items.ts`. Set `category`,
   `slot` (if wearable), and `script`.
2. Add (or rely on type fallback of) an entry in `ITEM_VISUAL_PRESETS`.
3. The registry parse-at-load (`parseAllItems`, exercised by
   `tests/items/registry.test.ts`) will fail the suite if the script has a
   syntax error.

## Events

| Event            | Payload                                                       |
| ---------------- | ------------------------------------------------------------- |
| `ItemUsed`       | `{ actor, item, defId }`                                      |
| `ItemEquipped`   | `{ actor, item, defId, slot }`                                |
| `ItemUnequipped` | `{ actor, item, defId, slot }`                                |
| `OnHitTriggered` | `{ attacker, defender, item, defId }`                         |

All four are formatted by `formatLogEntry` and are no-ops in the Phase 7
wire renderer — Phase 8 will subscribe and draw.
