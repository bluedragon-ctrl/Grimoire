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
    body: "A Collection is just a list — a row of values you can read by position, walk through with `for`, and ask the length of with `len(...)`. You never make one yourself; list literals like `[1, 2, 3]` and queries like `enemies()` hand them to you.\n\nProperties:\n\n- `length` — how many items are in the list.\n\nMethods:\n\n- `filter(pred)` — a new list with only the items where `pred(item)` is true.\n- `sorted_by(key)` — a new list sorted from smallest to largest `key(item)`.\n- `first()` / `last()` — the first or last item, or `null` if the list is empty.\n- `min_by(key)` / `max_by(key)` — the item with the smallest or largest `key(item)`, or `null` if empty.\n\nIndexing, looping, and asking \"is it empty?\" all work the way you'd expect:\n\n```\nxs = enemies()\nfirst_one = xs[0]\nfor e in xs:\n  attack(e)\nif xs:\n  attack(xs[0])\ncount = len(xs)\n```\n\n`pred` and `key` are usually `lambda` expressions, but a `def`'d function works too.",
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
    body: "Grimoire measures distance two different ways depending on what's asking:\n\n- **Square distance** — for moving, melee reach, and `me.distance_to(...)`. Diagonal steps count the same as straight ones. `me.adjacent_to(foe)` is true on any of the 8 tiles touching `me` (including diagonals).\n- **Round distance** — for area-of-effect spells. A radius-1 blast hits the 4 tiles directly next to the center plus the center itself; bigger radii fill in the round shape below.\n\nShort version: how far you can step is square; how far a blast reaches is round.\n\nRadius 1 (5 tiles):\n\n```text\n . X .\n X X X\n . X .\n```\n\nRadius 2 (13 tiles):\n\n```text\n . . X . .\n . X X X .\n X X X X X\n . X X X .\n . . X . .\n```\n\nRadius 3 (29 tiles):\n\n```text\n . . . X . . .\n . X X X X X .\n . X X X X X .\n X X X X X X X\n . X X X X X .\n . X X X X X .\n . . . X . . .\n```\n\nWhen you cast `fireball` on an enemy 4 tiles away, every actor inside the round blast around that tile takes the hit — including allies. Reach is square; blast is round.",
    examples: [
      { caption: "Don't fireball your own ally.", code: "if len(allies().filter(lambda a: me.distance_to(a) <= 2)) == 0:\n  cast(\"fireball\", enemies()[0])" },
    ],
    related: ["spells/fireball", "spells/frost_nova", "spells/thunderclap", "spells/meteor", "data/actor"],
  },
  failure: {
    id: "failure", name: "Action results",
    blurb: "What `cast`, `attack`, `use`, and friends give back when you use them inside `if` or `while`.",
    body: "Every command (`approach`, `attack`, `cast`, `use`, `pickup`, `drop`, `summon`, `wait`, `exit`) hands back a yes-or-no answer when you use it as a value. On its own line the answer is thrown away. Inside `if`, `while`, or on the right of `=` it's `True` if the action worked and `False` if it cleanly couldn't happen.\n\nClean failures don't cost a turn — being out of MP, having an empty bag, a full bag, and so on all give the turn back, so retrying in a loop is safe.\n\nIf you just want to *check* whether a cast would work without actually trying it, use `me.can_cast(...)`. Use the `if cast(...)` form when you want to try first and fall back only if it fails.\n\nWatch out: failures that aren't clean still burn the turn. Attacking someone who isn't next to you costs energy, for example.",
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
