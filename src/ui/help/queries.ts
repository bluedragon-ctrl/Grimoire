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
    body: "Shorthand for the acting actor. Useful with `has_effect(me, ...)` or `distance(me, foo)`.",
    examples: [{ caption: "Check a self-effect.", code: "if has_effect(me, \"burning\"):\n  wait()" }],
    related: ["data/actor", "queries/has_effect"],
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
    related: ["queries/max_mp", "queries/can_cast"],
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
    examples: [{ caption: "Only cast what you know.", code: "if known_spells().length > 0:\n  cast(known_spells()[0], enemies()[0])" }],
    related: ["commands/cast", "queries/can_cast"],
  },
  enemies: {
    id: "enemies", name: "enemies", signature: "enemies()",
    blurb: "Living non-hero actors, sorted nearest-first.",
    body: "Dead actors are excluded. Ties break by id (lexicographic).",
    examples: [{ caption: "Nearest enemy first.", code: "while enemies().length > 0:\n  approach(enemies()[0])" }],
    related: ["data/actor", "queries/distance", "queries/adjacent"],
  },
  items: {
    id: "items", name: "items", signature: "items()",
    blurb: "Static room items (designer-placed), sorted nearest-first.",
    body: "Separate from FloorItem drops. Use `items_here()` / `items_nearby()` for pickupable drops.",
    examples: [{ caption: "Walk to the first scripted item.", code: "if items().length > 0:\n  approach(items()[0])" }],
    related: ["queries/items_here", "queries/items_nearby", "data/item"],
  },
  items_here: {
    id: "items_here", name: "items_here", signature: "items_here()",
    blurb: "FloorItem stack on the hero's tile, top-first.",
    examples: [{ caption: "Pick up everything underfoot.", code: "for f in items_here():\n  pickup(f)" }],
    related: ["commands/pickup", "queries/items_nearby", "data/flooritem"],
  },
  items_nearby: {
    id: "items_nearby", name: "items_nearby", signature: "items_nearby(radius?)",
    blurb: "FloorItems within radius (default 4), Manhattan-sorted.",
    examples: [{ caption: "Grab nearby loot after a fight.", code: "for f in items_nearby():\n  approach(f)\n  pickup(f)" }],
    related: ["commands/pickup", "queries/items_here", "data/flooritem"],
  },
  chests: {
    id: "chests", name: "chests", signature: "chests()",
    blurb: "Unopened chests in the room, nearest-first.",
    examples: [{ caption: "Walk to the first chest.", code: "if chests().length > 0:\n  approach(chests()[0])" }],
    related: ["queries/items_here"],
  },
  doors: {
    id: "doors", name: "doors", signature: "doors()",
    blurb: "Doors in the room, nearest-first.",
    examples: [{ caption: "Head to the nearest door.", code: "approach(doors()[0])" }],
    related: ["commands/exit", "data/door"],
  },
  clouds: {
    id: "clouds", name: "clouds", signature: "clouds()",
    blurb: "Array of active cloud regions: `{id, pos, kind, remaining}`.",
    examples: [{ caption: "Avoid walking into a cloud.", code: "if clouds().length == 0:\n  approach(enemies()[0])" }],
    related: ["queries/cloud_at", "data/cloud", "spells/firewall"],
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
    related: ["queries/distance", "queries/adjacent"],
  },
  adjacent: {
    id: "adjacent", name: "adjacent", signature: "adjacent(a, b)",
    blurb: "True when two positions are 1 tile apart (Chebyshev).",
    examples: [{ caption: "Swing as soon as adjacent.", code: "if adjacent(me, enemies()[0]):\n  attack(enemies()[0])" }],
    related: ["queries/distance", "queries/at"],
  },
  distance: {
    id: "distance", name: "distance", signature: "distance(a, b)",
    blurb: "Chebyshev distance between two positions (integer tiles).",
    examples: [{ caption: "Cast from just outside melee.", code: "if distance(me, enemies()[0]) == 2:\n  cast(\"bolt\", enemies()[0])" }],
    related: ["queries/adjacent", "queries/at"],
  },
  can_cast: {
    id: "can_cast", name: "can_cast", signature: "can_cast(spellName, target?)",
    blurb: "Preflight a cast: true iff spell is known, MP sufficient, target valid & in range.",
    body: "Pass the same args you'd pass to `cast()`. If `target` is omitted, only target-independent checks run (learned + enough MP + in registry).",
    examples: [{ caption: "Gate a ranged opener.", code: "if can_cast(\"firebolt\", enemies()[0]):\n  cast(\"firebolt\", enemies()[0])" }],
    related: ["commands/cast", "queries/known_spells", "queries/mp"],
  },
  has_effect: {
    id: "has_effect", name: "has_effect", signature: "has_effect(target, kind)",
    blurb: "True if target carries a status of the given kind (string).",
    examples: [{ caption: "Let burning do the work.", code: "if has_effect(enemies()[0], \"burning\"):\n  wait()" }],
    related: ["queries/effects", "spells/firebolt"],
  },
  effects: {
    id: "effects", name: "effects", signature: "effects(target)",
    blurb: "Array of active effect-kind strings on target.",
    examples: [{ caption: "Skip targets already chilled.", code: "if effects(enemies()[0]).length == 0:\n  cast(\"frost_lance\", enemies()[0])" }],
    related: ["queries/has_effect", "spells/frost_lance"],
  },
};
