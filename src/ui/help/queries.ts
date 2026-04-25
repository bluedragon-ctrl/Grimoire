// Hand-authored help for every zero-cost query. Names match the keys in
// `queries` on src/commands.ts — if this list drifts from that object, the
// coverage test in tests/ui/help/index.test.ts will flag it.

import type { HelpEntry } from "./types.js";

type QueryHelp = Omit<HelpEntry, "category" | "path" | "examples" | "related"> & {
  signature: string;
  examples: HelpEntry["examples"];
  related?: string[];
};

export const QUERY_HELP: Record<string, QueryHelp> = {
  me: {
    id: "me", name: "me", signature: "me",
    blurb: "The hero's own Actor. Zero cost.",
    body: "Shorthand for the acting actor. Read fields off it (`me.hp`, `me.mp`) and call its methods (`me.has_effect(\"burning\")`, `me.distance_to(foe)`, `me.can_cast(\"bolt\", foe)`). See the Actor data page for the full surface.",
    examples: [{ caption: "Check a self-effect.", code: "if me.has_effect(\"burning\"):\n  wait()" }],
    related: ["data/actor"],
  },
  hp: {
    id: "hp", name: "hp", signature: "hp()",
    blurb: "Current HP of the hero.",
    examples: [{ caption: "Flee when bleeding.", code: "if hp() < 5:\n  flee(enemies()[0])" }],
    related: ["queries/mp", "data/actor"],
  },
  mp: {
    id: "mp", name: "mp", signature: "mp()",
    blurb: "Current MP of the hero.",
    examples: [{ caption: "Idle until mana for a bolt.", code: "while mp() < 5:\n  wait()" }],
    related: ["queries/max_mp", "data/actor"],
  },
  max_mp: {
    id: "max_mp", name: "max_mp", signature: "max_mp()",
    blurb: "Hero's MP ceiling (after equipment bonuses).",
    examples: [{ caption: "Gate on full mana.", code: "if mp() == max_mp():\n  cast(\"firebolt\", enemies()[0])" }],
    related: ["queries/mp"],
  },
  known_spells: {
    id: "known_spells", name: "known_spells", signature: "known_spells()",
    blurb: "Array of spell-name strings the hero has learned.",
    examples: [{ caption: "Only cast what you know.", code: "if len(known_spells()) > 0:\n  cast(known_spells()[0], enemies()[0])" }],
    related: ["commands/cast", "data/actor"],
  },
  enemies: {
    id: "enemies", name: "enemies", signature: "enemies()",
    blurb: "Living actors of an opposing faction, sorted nearest-first.",
    body: "Returns a Collection of actors whose faction differs from the caller's (player vs enemy). Dead actors and actors of the same faction are excluded. Two neutrals ignore each other. Ties break by id (lexicographic). Use `len(enemies())` for the count, `enemies()[0]` for the closest, or `.filter` / `.min_by` for fancier picks.",
    examples: [{ caption: "Nearest enemy first.", code: "while len(enemies()) > 0:\n  approach(enemies()[0])" }],
    related: ["queries/allies", "data/actor", "data/collection"],
  },
  allies: {
    id: "allies", name: "allies", signature: "allies()",
    blurb: "Living actors of the same faction (excluding self), sorted nearest-first.",
    body: "Returns actors that share the caller's faction. Dead actors and the caller itself are excluded. Two neutrals are not considered allies. Ties break by id (lexicographic).",
    examples: [{ caption: "Heal the nearest ally if one is hurt.", code: "if len(allies()) > 0 and me.can_cast(\"heal\", allies()[0]):\n  cast(\"heal\", allies()[0])" }],
    related: ["queries/enemies", "data/actor", "data/collection", "commands/summon"],
  },
  items: {
    id: "items", name: "items", signature: "items()",
    blurb: "Static room items (designer-placed), sorted nearest-first.",
    body: "Separate from FloorItem drops. Use `items_here()` / `items_nearby()` for pickupable drops.",
    examples: [{ caption: "Walk to the first scripted item.", code: "if len(items()) > 0:\n  approach(items()[0])" }],
    related: ["queries/items_here", "queries/items_nearby", "queries/chests", "data/item", "data/collection"],
  },
  items_here: {
    id: "items_here", name: "items_here", signature: "items_here()",
    blurb: "FloorItem stack on the hero's tile, top-first.",
    examples: [{ caption: "Pick up everything underfoot.", code: "for f in items_here():\n  pickup(f)" }],
    related: ["commands/pickup", "queries/items_nearby", "data/flooritem", "data/collection"],
  },
  items_nearby: {
    id: "items_nearby", name: "items_nearby", signature: "items_nearby(radius?)",
    blurb: "FloorItems within radius (default 4), Manhattan-sorted.",
    examples: [{ caption: "Grab nearby loot after a fight.", code: "for f in items_nearby():\n  approach(f)\n  pickup(f)" }],
    related: ["commands/pickup", "queries/items_here", "data/flooritem", "data/collection"],
  },
  chests: {
    id: "chests", name: "chests", signature: "chests()",
    blurb: "Unopened chests in the room, nearest-first.",
    examples: [{ caption: "Walk to the first chest.", code: "if len(chests()) > 0:\n  approach(chests()[0])" }],
    related: ["queries/items_here", "data/collection"],
  },
  doors: {
    id: "doors", name: "doors", signature: "doors()",
    blurb: "Doors in the room, nearest-first.",
    examples: [{ caption: "Head to the nearest door.", code: "approach(doors()[0])" }],
    related: ["commands/exit", "data/door", "data/collection"],
  },
  clouds: {
    id: "clouds", name: "clouds", signature: "clouds()",
    blurb: "Array of active cloud regions: `{id, pos, kind, remaining}`.",
    examples: [{ caption: "Avoid walking into a cloud.", code: "if len(clouds()) == 0:\n  approach(enemies()[0])" }],
    related: ["queries/cloud_at", "data/cloud", "spells/firewall", "data/collection", "commands/wait"],
  },
  cloud_at: {
    id: "cloud_at", name: "cloud_at", signature: "cloud_at(target)",
    blurb: "Topmost cloud `kind` string at a position, or null.",
    examples: [{ caption: "Don't step into fire.", code: "if cloud_at(enemies()[0]) == null:\n  approach(enemies()[0])" }],
    related: ["queries/clouds", "data/cloud"],
  },
  at: {
    id: "at", name: "at", signature: "at(target)",
    blurb: "True when the hero's tile equals the target position.",
    examples: [{ caption: "Stop walking once on the door.", code: "while not at(doors()[0]):\n  approach(doors()[0])" }],
    related: ["data/actor"],
  },
  // Phase 13.2: RNG builtins.
  chance: {
    id: "chance", name: "chance", signature: "chance(p)",
    blurb: "Returns true with probability p% using the world's seedable RNG.",
    body: "`p` is a percentage (0–100). `chance(0)` is always false; `chance(100)` is always true. Uses the engine's deterministic mulberry32 RNG — the same seed always produces the same sequence.",
    examples: [{ caption: "Summon reinforcements 20% of the time.", code: "if chance(20):\n  summon(\"goblin\", enemies()[0])" }],
    related: ["queries/random"],
  },
  random: {
    id: "random", name: "random", signature: "random(n)",
    blurb: "Returns a random integer in [0, n) using the world's seedable RNG.",
    body: "`random(1)` always returns 0. `random(0)` returns 0. Uses the engine's deterministic mulberry32 RNG.",
    examples: [{ caption: "Vary wait duration.", code: "r = random(5)\nif r == 0:\n  wait()" }],
    related: ["queries/chance"],
  },
};
