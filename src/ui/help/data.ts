// Data-shape leaves — one page per value shape a script can observe. The
// intent is to tell a reader "here is every field I can read off this thing"
// without forcing them to open the TypeScript sources.

import type { HelpEntry } from "./types.js";

type DataPage = Omit<HelpEntry, "category" | "path"> & {
  examples: HelpEntry["examples"];
  related: string[];
};

export const DATA_PAGES: Record<string, DataPage> = {
  actor: {
    id: "actor", name: "Actor",
    blurb: "The thing at the end of `me`, `enemies()[i]`, and `hit` handler bindings.",
    body: "Fields a script may read:\n\n- `id` — unique string\n- `kind` — template id (`\"goblin\"`, `\"slime\"`, etc.)\n- `pos.x`, `pos.y` — tile coordinates\n- `hp`, `maxHp`, `mp`, `maxMp`\n- `atk`, `def`, `int` — combat stats (all may be undefined)\n- `alive` — boolean\n- `is_hero` — true for the player\n- `is_summoned` — true when summoned by another actor\n- `summoner` — the owning Actor (or `null`)\n\nMethods (call with `actor.method(...)`):\n\n- `distance_to(other)` — Chebyshev tiles between this actor and a position/actor/door\n- `adjacent_to(other)` — true when `distance_to(other) == 1`\n- `in_los(other)` — clear line of sight\n- `has_effect(kind)`, `effect_remaining(kind)`, `effect_magnitude(kind)`, `list_effects()`\n- `can_cast(spell, target?)` — preflight a cast (target optional)\n\nActors are live references: reading `pos` on the next tick reflects movement.",
    examples: [
      { caption: "Distance-gate an attack.", code: "foe = enemies()[0]\nif me.distance_to(foe) == 1:\n  attack(foe)" },
      { caption: "Access HP through the actor.", code: "e = enemies()[0]\nif e.hp < 2:\n  attack(e)" },
      { caption: "Branch on actor kind.", code: "foe = enemies()[0]\nif foe.kind == \"bat\":\n  flee(foe)\nelse:\n  attack(foe)" },
    ],
    related: ["queries/me", "queries/enemies", "queries/hp", "data/collection", "data/aoe"],
  },
  collection: {
    id: "collection", name: "Collection",
    blurb: "Pythonic list returned by every list-shaped query (`enemies()`, `allies()`, `items_nearby()`, ...).",
    body: "A Collection wraps an array so the language can intercept indexing, iteration, and `len`. You won't construct one yourself — list literals (`[1, 2, 3]`) and queries hand them to you.\n\nProperties:\n\n- `length` — number of items.\n\nMethods:\n\n- `filter(pred)` — new Collection of items where `pred(item)` is truthy.\n- `sorted_by(key)` — new Collection sorted by `key(item)` ascending.\n- `first()` / `last()` — first or last item, or `null` if empty.\n- `min_by(key)` / `max_by(key)` — item with the smallest / largest `key(item)`, or `null` if empty.\n\nIndexing, iteration, and emptiness work the obvious way:\n\n```\nxs = enemies()\nfirst = xs[0]\nfor e in xs:\n  attack(e)\nif xs:\n  ...      # truthy when non-empty\nlen(xs)    # count\n```\n\n`pred` and `key` are typically `lambda` expressions, but any callable works.",
    examples: [
      { caption: "Pick the weakest enemy.", code: "weakest = enemies().min_by(lambda e: e.hp)\nattack(weakest)" },
      { caption: "Filter then attack.", code: "for e in enemies().filter(lambda e: e.hp < 3):\n  attack(e)" },
      { caption: "Sort by distance, take nearest.", code: "near = enemies().sorted_by(lambda e: me.distance_to(e)).first()\napproach(near)" },
    ],
    related: ["data/actor", "queries/enemies", "queries/allies", "queries/items_nearby"],
  },
  aoe: {
    id: "aoe", name: "AoE shape",
    blurb: "How distance, adjacency, and area-of-effect spells measure tiles.",
    body: "Two distance metrics live side by side in Grimoire:\n\n- **Chebyshev (square)** — used by movement, adjacency, melee range, and `me.distance_to(...)`. Diagonals count as one step. `me.adjacent_to(foe)` is true on the eight tiles surrounding `me`.\n- **Euclidean (round)** — used by AoE spells. `radius 1` covers the four orthogonal neighbours plus the centre; `radius 2` is the rounded blob below.\n\nAdjacency is square. AoE is round.\n\nRadius 1 (5 tiles):\n\n```\n . X .\n X X X\n . X .\n```\n\nRadius 2 (13 tiles):\n\n```\n . . X . .\n . X X X .\n X X X X X\n . X X X .\n . . X . .\n```\n\nRadius 3 (29 tiles):\n\n```\n . . . X . . .\n . X X X X X .\n . X X X X X .\n X X X X X X X\n . X X X X X .\n . X X X X X .\n . . . X . . .\n```\n\nWhen you cast `fireball` on an enemy 4 tiles away, every actor inside the round blast around that tile takes the hit — including allies. Reach is square; blast is round.",
    examples: [
      { caption: "Don't fireball your own ally.", code: "if len(allies().filter(lambda a: me.distance_to(a) <= 2)) == 0:\n  cast(\"fireball\", enemies()[0])" },
    ],
    related: ["spells/fireball", "spells/frost_nova", "spells/thunderclap", "spells/meteor", "data/actor"],
  },
  failure: {
    id: "failure", name: "Action results",
    blurb: "What `cast`, `attack`, `use`, etc. give back when used in an `if` or `while`.",
    body: "Every command (`approach`, `attack`, `cast`, `use`, `pickup`, `drop`, `summon`, `wait`, `exit`) yields a result. As a statement, the result is dropped. Inside an expression — the condition of `if` or `while`, or the right side of `=` — it resolves to `True` on success and `False` on a clean failure.\n\nClean failures don't drain energy: `cast` out of MP, `use` on an empty bag, `pickup` with a full bag, etc., all refund the action slot. So a retry loop is safe.\n\nUse `me.can_cast(...)` to *preflight* a cast (cheaper, no attempt). Use the in-expression `cast(...)` form when you want to fall through to a fallback only when the cast actually fails.\n\nThings that are not clean failures still cost: `attack` on a non-adjacent target costs energy, for example.",
    examples: [
      { caption: "Try the bolt; otherwise close in.", code: "if not cast(\"bolt\", enemies()[0]):\n  approach(enemies()[0])" },
      { caption: "Empty the bag of potions before fighting.", code: "while use(\"health_potion\"):\n  pass" },
    ],
    related: ["commands/cast", "commands/use", "commands/attack", "data/actor"],
  },
  door: {
    id: "door", name: "Door",
    blurb: "Exit tile: `{dir, pos}`.",
    body: "- `dir` — one of \"N\" | \"S\" | \"E\" | \"W\"\n- `pos.x`, `pos.y` — the door tile",
    examples: [{ caption: "Walk to first door and exit.", code: "approach(doors()[0])\nif at(doors()[0]):\n  exit()" }],
    related: ["queries/doors", "commands/exit"],
  },
  item: {
    id: "item", name: "Item",
    blurb: "Static, designer-placed room item: `{id, kind, pos}`.",
    body: "Distinct from FloorItem (loot drops). Returned from `items()`. `kind` is a free-form string set by the designer.",
    examples: [{ caption: "Approach a room item.", code: "if items().length > 0:\n  approach(items()[0])" }],
    related: ["queries/items", "data/flooritem"],
  },
  flooritem: {
    id: "flooritem", name: "FloorItem",
    blurb: "A dropped item that can be picked up: `{id, defId, pos}`.",
    body: "`defId` is a key into the ITEMS registry (e.g., \"health_potion\"). Emitted by monster loot, equip-overflow, and explicit `drop()` calls.",
    examples: [{ caption: "Pick up matching defId nearby.", code: "for f in items_nearby():\n  if f.defId == \"health_potion\":\n    approach(f)\n    pickup(f)" }],
    related: ["queries/items_here", "queries/items_nearby", "commands/pickup", "commands/drop"],
  },
  cloud: {
    id: "cloud", name: "Cloud",
    blurb: "Hazard region: `{id, pos, kind, remaining}`.",
    body: "`kind` is a string like \"fire\" or \"frost\". `remaining` counts down each tick until the cloud expires. Use `cloud_at(pos)` for a single-tile lookup.",
    examples: [{ caption: "Wait until clouds are gone.", code: "while clouds().length > 0:\n  wait()" }],
    related: ["queries/clouds", "queries/cloud_at", "spells/firewall"],
  },
};
