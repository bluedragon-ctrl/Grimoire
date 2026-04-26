// Hand-authored help for every zero-cost query. Names match the keys in
// `queries` on src/commands.ts — if this list drifts from that object, the
// coverage test in tests/ui/help/index.test.ts will flag it.
//
// `group` tags drive the subsection headers in the help pane (see
// help-pane.ts::GROUP_ORDER). Keep the four groups in sync with the doc
// at docs/dsl-queries.md.

import type { HelpEntry } from "./types.js";

type QueryHelp = Omit<HelpEntry, "category" | "path" | "examples" | "related"> & {
  signature: string;
  examples: HelpEntry["examples"];
  related?: string[];
  group?: string;
};

export const QUERY_HELP: Record<string, QueryHelp> = {
  me: {
    id: "me", name: "me", signature: "me",
    group: "Self shortcuts",
    blurb: "The acting actor. Read fields and call methods off this.",
    body: "Shorthand for the actor whose script is currently evaluating. Read fields off it (`me.hp`, `me.mp`, `me.knownSpells`, `me.inventory`) and call its methods (`me.has_effect(\"burning\")`, `me.distance_to(foe)`, `me.can_cast(\"bolt\", foe)`). See the Actor data page for the full surface.",
    examples: [{ caption: "Check a self-effect.", code: "if me.has_effect(\"burning\"):\n  wait()" }],
    related: ["data/actor"],
  },
  hp: {
    id: "hp", name: "hp", signature: "hp()",
    group: "Self shortcuts",
    blurb: "Shortcut for `me.hp` — current HP of the caller.",
    body: "Identical to `me.hp`. Kept as a shortcut because health checks are the most common guard in scripts.",
    examples: [{ caption: "Flee when bleeding.", code: "if hp() < 5:\n  flee(enemies()[0])" }],
    related: ["queries/max_hp", "queries/mp", "data/actor"],
  },
  max_hp: {
    id: "max_hp", name: "max_hp", signature: "max_hp()",
    group: "Self shortcuts",
    blurb: "Shortcut for `me.maxHp` — HP ceiling (after equipment bonuses).",
    examples: [{ caption: "Heal at less than full.", code: "if hp() < max_hp():\n  cast(\"heal\", me)" }],
    related: ["queries/hp", "data/actor"],
  },
  mp: {
    id: "mp", name: "mp", signature: "mp()",
    group: "Self shortcuts",
    blurb: "Shortcut for `me.mp` — current MP of the caller.",
    examples: [{ caption: "Idle until mana for a bolt.", code: "while mp() < 5:\n  wait()" }],
    related: ["queries/max_mp", "queries/hp", "data/actor"],
  },
  max_mp: {
    id: "max_mp", name: "max_mp", signature: "max_mp()",
    group: "Self shortcuts",
    blurb: "Shortcut for `me.maxMp` — MP ceiling (after equipment bonuses).",
    examples: [{ caption: "Gate on full mana.", code: "if mp() == max_mp():\n  cast(\"firebolt\", enemies()[0])" }],
    related: ["queries/mp", "data/actor"],
  },
  enemies: {
    id: "enemies", name: "enemies", signature: "enemies()",
    group: "Room listings",
    blurb: "Living actors of an opposing faction, sorted nearest-first.",
    body: "Returns a Collection of actors whose faction differs from the caller's (player vs enemy). Dead actors and actors of the same faction are excluded. Two neutrals ignore each other. Ties break by id (lexicographic). Use `len(enemies())` for the count, `enemies()[0]` for the closest, or `.filter` / `.min_by` for fancier picks.",
    examples: [{ caption: "Nearest enemy first.", code: "while len(enemies()) > 0:\n  approach(enemies()[0])" }],
    related: ["queries/allies", "data/actor", "data/collection"],
  },
  allies: {
    id: "allies", name: "allies", signature: "allies()",
    group: "Room listings",
    blurb: "Living actors of the same faction (excluding self), sorted nearest-first.",
    body: "Returns actors that share the caller's faction. Dead actors and the caller itself are excluded. Two neutrals are not considered allies. Ties break by id (lexicographic).",
    examples: [{ caption: "Heal the nearest ally if one is hurt.", code: "if len(allies()) > 0 and me.can_cast(\"heal\", allies()[0]):\n  cast(\"heal\", allies()[0])" }],
    related: ["queries/enemies", "data/actor", "data/collection", "commands/summon"],
  },
  items: {
    id: "items", name: "items", signature: "items(radius?)",
    group: "Room listings",
    blurb: "FloorItems in the room, nearest-first (Chebyshev). Optional radius filter.",
    body: "No arg returns every floor item in the room. With `radius`, restrict to Chebyshev distance ≤ radius — `items(0)` is the stack on the hero's tile, `items(1)` adds the 8 neighbors. Ties break by id.",
    examples: [
      { caption: "Pick up everything underfoot.", code: "for f in items(0):\n  pickup(f)" },
      { caption: "Grab loot after a fight.", code: "while len(items()) > 0:\n  approach(items()[0])\n  pickup()" },
    ],
    related: ["commands/pickup", "queries/distance", "data/flooritem", "data/collection"],
  },
  objects: {
    id: "objects", name: "objects", signature: "objects(radius?)",
    group: "Room listings",
    blurb: "Dungeon objects (chests, fountains, doors) in the room, nearest-first (Chebyshev). Optional radius filter.",
    body: "No arg returns every RoomObject in the room. With `radius`, restrict to Chebyshev distance ≤ radius — `objects(1)` is the hero's tile + the 8 neighbors (the set you can `interact()` with).\n\nKinds: `chest`, `fountain_health`, `fountain_mana`, `door_closed`, `exit_door_closed`. Locked variants need a key in the inventory.",
    examples: [
      { caption: "Tap a fountain when low on mana.", code: "for obj in objects(1):\n  if obj.kind == \"fountain_mana\" and me.mp < me.maxMp:\n    interact(obj)" },
      { caption: "Open the locked exit after grabbing the keymaster's key.", code: "for obj in objects(1):\n  if obj.kind == \"exit_door_closed\":\n    interact(obj)" },
    ],
    related: ["commands/interact", "queries/chests", "queries/distance"],
  },
  chests: {
    id: "chests", name: "chests", signature: "chests()",
    group: "Room listings",
    blurb: "Unopened chests in the room, nearest-first.",
    examples: [{ caption: "Walk to the first chest.", code: "if len(chests()) > 0:\n  approach(chests()[0])" }],
    related: ["queries/items", "queries/objects", "data/collection"],
  },
  doors: {
    id: "doors", name: "doors", signature: "doors()",
    group: "Room listings",
    blurb: "Doors in the room, nearest-first.",
    examples: [{ caption: "Head to the nearest door.", code: "approach(doors()[0])" }],
    related: ["commands/exit", "data/door", "data/collection"],
  },
  clouds: {
    id: "clouds", name: "clouds", signature: "clouds()",
    group: "Room listings",
    blurb: "Array of active cloud regions: `{id, pos, kind, remaining}`.",
    examples: [{ caption: "Avoid walking into a cloud.", code: "if len(clouds()) == 0:\n  approach(enemies()[0])" }],
    related: ["data/cloud", "spells/firewall", "data/collection", "commands/wait"],
  },
  at: {
    id: "at", name: "at", signature: "at(target)",
    group: "Positioning",
    blurb: "True when the hero's tile equals the target position.",
    examples: [{ caption: "Stop walking once on the door.", code: "while not at(doors()[0]):\n  approach(doors()[0])" }],
    related: ["queries/distance", "data/actor"],
  },
  distance: {
    id: "distance", name: "distance", signature: "distance(a, b)",
    group: "Positioning",
    blurb: "Chebyshev distance between two positioned things. Returns 0 on unresolvable args.",
    body: "Accepts actors, items, objects, doors, chests, or bare `{x,y}` / `{pos:{x,y}}` records. Chebyshev metric (king's-move) — adjacent diagonals are distance 1, matching `me.adjacent_to()` and `attack()` range.",
    examples: [
      { caption: "Only engage if the foe is close.", code: "foe = enemies()[0]\nif distance(me, foe) <= 3:\n  approach(foe)\n  attack(foe)" },
      { caption: "Pick the closest of two pickups.", code: "near = items()[0]\nfar  = items()[1]\nif distance(me, near) < distance(me, far):\n  approach(near)" },
    ],
    related: ["queries/items", "queries/objects", "queries/at", "data/actor"],
  },
  chance: {
    id: "chance", name: "chance", signature: "chance(p)",
    group: "RNG",
    blurb: "Returns true with probability p% using the world's seedable RNG.",
    body: "`p` is a percentage (0–100). `chance(0)` is always false; `chance(100)` is always true. Uses the engine's deterministic mulberry32 RNG — the same seed always produces the same sequence.",
    examples: [{ caption: "Summon reinforcements 20% of the time.", code: "if chance(20):\n  summon(\"goblin\", enemies()[0])" }],
    related: ["queries/random"],
  },
  random: {
    id: "random", name: "random", signature: "random(n)",
    group: "RNG",
    blurb: "Returns a random integer in [0, n) using the world's seedable RNG.",
    body: "`random(1)` always returns 0. `random(0)` returns 0. Uses the engine's deterministic mulberry32 RNG.",
    examples: [{ caption: "Vary wait duration.", code: "r = random(5)\nif r == 0:\n  wait()" }],
    related: ["queries/chance"],
  },
};
