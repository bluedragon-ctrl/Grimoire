# DSL queries

Queries are zero-cost lookups available to any actor script (hero or
monster). They evaluate inline during expression eval — they never consume
energy, never yield, never emit events, and never mutate world state.

Implementation lives in `src/commands.ts::queries`. All registry entries are
symmetric with respect to the caller: the `self` passed in is whichever
actor's script is currently evaluating, so the same query set powers the
hero and monster AI scripts uniformly.

All distance and sort metrics are **Chebyshev** (king's-move) — diagonal
steps cost 1, matching the way `attack()` reach and `me.distance_to()`
already work. AoE spell shapes use Euclidean radius (see `data/aoe`).

## Self shortcuts

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `me`                         | `Actor`                | The evaluating actor.                                                                   |
| `hp()` / `max_hp()`          | `number`               | Shortcut for `me.hp` / `me.maxHp`.                                                      |
| `mp()` / `max_mp()`          | `number`               | Shortcut for `me.mp` / `me.maxMp`.                                                      |

For any other self-state, read the field off `me` directly: `me.knownSpells`,
`me.inventory`, `me.effects`, `me.faction`, etc.

## Room listings

All sorted nearest-first by Chebyshev distance from the caller. Ties break
by id (lexicographic).

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `enemies()`                  | `Actor[]`              | Living actors of an opposing faction.                                                   |
| `allies()`                   | `Actor[]`              | Living actors of the same faction (excluding self).                                     |
| `items(r?)`                  | `FloorItem[]`          | Floor pickups. No arg = whole room; `items(0)` = same tile; `items(r)` = within `r`.    |
| `objects(r?)`                | `RoomObject[]`         | Chests, fountains, doors. `objects(1)` is the set you can `interact()` with.            |
| `chests()`                   | `Chest[]`              | Unopened room chests (legacy view; `objects()` covers chests too).                      |
| `doors()`                    | `Door[]`               | Room doors.                                                                             |
| `clouds()`                   | `{id, pos, kind, remaining}[]` | Snapshot of live cloud tiles.                                                           |

## Positioning

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `at(target)`                 | `boolean`              | `me.pos` equals target's resolved position.                                             |
| `distance(a, b)`             | `number`               | Chebyshev distance between any two positioned things. 0 on unresolvable args.           |

`distance` accepts actors, items, objects, doors, chests, and bare
`{pos: {x,y}}` / `{x,y}` objects, going through the same `resolvePos` seam.
For "is this thing adjacent to me?" use `me.adjacent_to(other)` on the actor
surface.

## RNG

| Query                        | Returns                | Notes                                                                                   |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `chance(p)`                  | `boolean`              | True with probability `p`% (0–100). Deterministic via `worldRandom`.                    |
| `random(n)`                  | `number`               | Random integer in `[0, n)`. Deterministic.                                              |

## Effects and spells (on the actor surface)

These hang off `me` (or any actor handle) rather than as standalone queries:

- `me.has_effect(kind)` / `me.effect_remaining(kind)` / `me.effect_magnitude(kind)`
- `me.list_effects()` — `string[]` of active effect kinds
- `me.can_cast(name)` — known + enough mp; skips target/range
- `me.can_cast(name, target)` — full pipeline check; mirrors `spells/cast.ts::validateCast`
- `me.in_los(other)` — smoke-aware Bresenham line-of-sight
- `me.in_cloud()` / `me.in_cloud(kind)` — true when standing in any cloud, or one of the given kind

## Events and handlers

Handlers fire uniformly for any actor with a matching `on <event>` block —
not just the hero. A goblin's `on hit as attacker: flee(attacker)` runs on
the next scheduler step after the hero's attack, using the same dispatch
path described in `engine-design.md § Events and handler preemption`. Main
halting via `halt()` does not disable handlers; handlers continue to fire
on a halted actor until the actor dies.
