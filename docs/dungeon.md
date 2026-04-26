# Dungeon — Archetypes, Run Lifecycle, Inventory

A procedural single-room infinite-depth dungeon. Each room is one of 5 archetypes; rooms scale with depth.

## Run lifecycle

```
[Game start]
  └─ Fresh empty depot seeded with STARTING_INVENTORY consumables
  └─ Equipped slots = starter wearables (wooden_staff, bone_dagger)
  └─ Known spells = starter spells
  └─ Run stats zero
  └─ Pre-attempt loadout screen → attempt 1, depth 1

[During an attempt]
  └─ Procedural rooms; hp/mp persist between rooms; exit() advances depth
  └─ Stats incremented: monsters slain, items collected, deepest depth

[On hero death]
  └─ Auto-route inventory wearables (empty slot → equip, occupied → depot)
  └─ Inventory consumables → depot; keys discarded; equipped wearables stay equipped
  └─ Death recap with TWO buttons:
      ┌─ TRY AGAIN: pre-attempt loadout screen → new attempt at depth 1
      └─ QUIT: confirm dialog → final review screen → wipe localStorage → fresh game state
```

A **run** = persistent meta-state, ends only on QUIT. An **attempt** = one descent.

## Archetypes

Weighted dispatch in [`src/dungeon/archetypes.ts`](../src/dungeon/archetypes.ts).

| Archetype | Weight | Contents |
|---|---|---|
| **Combat** | 40% | 2–4 monsters, no special objects |
| **Vault** | 20% | 1–3 monsters incl. tagged keymaster, 1 locked chest in a wall-corner partition (3 walls + 1 locked door); skippable |
| **Conduit** | 20% | 0–2 weak monsters, 1 fountain (50/50 health vs mana) |
| **Cache** | 10% | 2–3 monsters, 1 unlocked chest |
| **Trap** | 10% | 2–4 monsters incl. keymaster, exit door locked |

### Teaching ramp (depths 1–3)

- **Trap** archetype is suppressed at depths 1–3.
- **Vault** at depths 1–3 generates with the chest unlocked + door also unlocked (still drawn). Players see what doors and chests look like in a low-stakes context.
- At depth 4+, locked variants and the Trap archetype spawn as designed.

### Room sizes

```ts
roomSize(depth) = clamp(8 + floor(depth / 4), 8, 16)   // base
w, h rolled independently within ±2 of the base
```

## Dungeon objects

`RoomObject` lives on `Room.objects`. Kinds: `chest`, `fountain_health`, `fountain_mana`, `door_closed`, `exit_door_closed`. Locked chests/doors require a `key` consumable.

| Object | Adjacent + interact() | Console line |
|---|---|---|
| `chest` (unlocked) | Roll loot table, push items into inventory, remove chest | "CHEST OPENED" |
| `chest` (locked) with key | Consume key, treat as unlocked | "CHEST UNLOCKED" |
| `chest` (locked) no key | Fail with `"chest is locked"` | — |
| `fountain_health` | Hero hp → maxHp | "FOUNTAIN TAPPED — HP RESTORED" |
| `fountain_mana` | Hero mp → maxMp | "FOUNTAIN TAPPED — MP RESTORED" |
| `door_closed` (locked) with key | Consume key, set state to open | "DOOR UNLOCKED" |
| `exit_door_closed` (locked) with key | Consume key, exit() now succeeds | "EXIT UNLOCKED" |
| `exit_door_closed` (locked) no key | Fail with `"the exit is sealed"` | — |

Fountains do NOT deplete. Chests vanish on open. Locked doors block movement until unlocked.

## Inventory model

Three persistent zones + one transient zone:

| Zone | Capacity | Lifetime | Contents |
|---|---|---|---|
| **Depot** | Unlimited | Persistent | Consumables, scrolls, wearables not currently equipped |
| **Equipped slots** (5) | 1 per slot | Persistent | Currently worn wearables |
| **Known spells** | Unlimited | Persistent | Spells learned via auto-learn from scrolls |
| **Inventory** | Unlimited (transient) | Per-attempt | What hero is carrying right now |

### Mid-attempt rules

- `pickup()` and chest-open route everything to `inventory` — no caps.
- Wearables collected during an attempt **stay in inventory**. No auto-equip mid-attempt.
- Scrolls auto-learn at room-clear.
- Keys live in inventory; auto-consumed by `interact()` on locked things.
- `use()` operates on inventory consumables only.

### Attempt-end auto-routing (death)

For each wearable in inventory:
- If target slot is empty → equip
- If slot is occupied → send to depot

Consumables → depot. Keys → discarded. Equipped wearables stay equipped. Known spells persist.

## Pre-attempt loadout

Shown at the start of every attempt. Lists depot consumables and lets the player pick up to **4 items** to seed inventory. Wearables and scrolls are not pickable here. The BREACH button starts the attempt.

## DSL surface — dungeon objects

- `interact(target?)` — opens chests, taps fountains, unlocks doors. Single verb. 10 energy. Failed interacts (no target, locked + no key) refund.
- `objects_nearby()` — array of `{kind, pos, locked?}` records for adjacent dungeon objects.

```python
# Tap a fountain when low on mana
for obj in objects_nearby():
  if obj.kind == "fountain_mana" and me.mp < me.maxMp:
    interact(obj)

# Kill the keymaster, then unlock the chest
while len(enemies()) > 0:
  approach(enemies()[0])
  attack(enemies()[0])
for obj in objects_nearby():
  if obj.kind == "chest":
    interact(obj)
```

## Persistence

Single localStorage key: `grimoire.run.v1`. Saved at room clear, attempt end, attempt start, quit. Cleared by QUIT confirmation only.

## Out of scope (future work)

- Loadout UI for wearables/equipment
- Traps placement (visuals already exist)
- Boss rooms; multi-tier keys; tile decoration; adaptive difficulty
