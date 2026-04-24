# DSL queries

Queries are zero-cost lookups available to any actor script (hero or
monster). They evaluate inline during expression eval — they never consume
energy, never yield, never emit events, and never mutate world state.

Implementation lives in `src/commands.ts::queries`. All registry entries are
symmetric with respect to the caller: the `self` passed in is whichever
actor's script is currently evaluating, so the same query set powers the
hero and the AI scripts of Phase 11 monsters.

## Core

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `me`                         | `Actor`                | The evaluating actor.                                                                   |
| `hp()`                       | `number`               | Current HP.                                                                             |
| `mp()` / `max_mp()`          | `number`               | Current and max mana.                                                                   |
| `known_spells()`             | `string[]`             | Copy of the caster's learned-spell list.                                                |
| `hp(actor)`                  | *(not provided)*       | Use `actor.hp` directly via member access.                                              |

## Targets and positioning

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `enemies()`                  | `Actor[]`              | Other living actors, sorted by Manhattan distance from `me`.                            |
| `items()`                    | `Item[]`               | Room items (fixtures), Manhattan-sorted.                                                |
| `chests()`                   | `Chest[]`              | Room chests, Manhattan-sorted.                                                          |
| `doors()`                    | `Door[]`               | Room doors, Manhattan-sorted.                                                           |
| `at(target)`                 | `boolean`              | `me.pos` equals target's resolved position.                                             |
| `distance(a, b)`             | `number`               | **Chebyshev** distance between any two positioned things. 0 on unresolvable args.       |
| `adjacent(a, b)`             | `boolean`              | `distance(a, b) == 1`. `adjacent(me, me)` is `false` (same tile is not adjacent).       |

Both `distance` and `adjacent` accept actors, doors, items, chests, and bare
`{pos: {x,y}}` / `{x,y}` objects, going through the same `resolvePos` seam.

## Spells

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `can_cast(name)`             | `boolean`              | Spell known + enough mp. Skips target/range checks.                                     |
| `can_cast(name, target)`     | `boolean`              | Full validation — unknown spell, not learned, not enough mp, bad target type, or out of range all return `false`. Mirrors the six-step pipeline in `spells/cast.ts::validateCast`, so a `true` here means a subsequent `cast(name, target)` can only fail on world state that changes between the check and the cast. |

## Effects / clouds

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `has_effect(target, kind)`   | `boolean`              | Status effect by kind (e.g. `"burning"`, `"haste"`).                                    |
| `effects(target)`            | `string[]`             | All active effect kinds on target.                                                      |
| `clouds()`                   | `{id, pos, kind, remaining}[]` | Snapshot of live cloud tiles.                                                           |
| `cloud_at(target)`           | `string \| null`       | Topmost cloud kind on a tile, or `null`.                                                |

## Floor items (Phase 9)

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `items_here()`               | `FloorItem[]`          | Stack on `me.pos`, topmost first (LIFO — matches `pickup()` default).                   |
| `items_nearby(r?)`           | `FloorItem[]`          | Within radius `r` (default 4), Manhattan-sorted.                                        |

## Events and handlers

Handlers fire uniformly for any actor with a matching `on <event>` block —
not just the hero. A goblin's `on hit as attacker: flee(attacker)` runs on
the next scheduler step after the hero's attack, using the same dispatch
path described in `engine-design.md § Events and handler preemption`. Main
halting via `halt()` does not disable handlers; handlers continue to fire
on a halted actor until the actor dies.
