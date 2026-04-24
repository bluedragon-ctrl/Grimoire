// Longer paste-ready scripts. Each one is a full standalone script — parseable
// on its own, exercisable by copy → Script editor → Run.

import type { HelpEntry } from "./types.js";

type ExamplePage = Omit<HelpEntry, "category" | "path"> & {
  examples: HelpEntry["examples"];
  related: string[];
};

export const EXAMPLE_PAGES: Record<string, ExamplePage> = {
  melee: {
    id: "melee", name: "Simple melee loop",
    blurb: "Close the gap and swing until the room is empty.",
    body: "Canonical opener. Walks toward the nearest enemy and attacks — the stepwise tick model handles adjacency on its own.",
    examples: [{
      code:
        "# Clear every enemy, then leave north.\n" +
        "while enemies().length > 0:\n" +
        "  approach(enemies()[0])\n" +
        "  attack(enemies()[0])\n" +
        "\n" +
        "while not at(doors()[0]):\n" +
        "  approach(doors()[0])\n" +
        "exit()\n" +
        "halt",
    }],
    related: ["commands/approach", "commands/attack", "commands/exit"],
  },
  heal_low: {
    id: "heal_low", name: "Heal when low HP",
    blurb: "Consume potions when HP dips; otherwise fight.",
    body: "A health-gated version of the melee loop. `use(\"health_potion\")` refunds cleanly if the bag is empty — the retry loop just falls through.",
    examples: [{
      code:
        "while enemies().length > 0:\n" +
        "  if hp() < 6:\n" +
        "    use(\"health_potion\")\n" +
        "  approach(enemies()[0])\n" +
        "  attack(enemies()[0])\n" +
        "halt",
    }],
    related: ["commands/use", "queries/hp", "items/health_potion"],
  },
  cast_or_approach: {
    id: "cast_or_approach", name: "Cast at range, else approach",
    blurb: "Bolt when in range with mana, otherwise close distance.",
    body: "`can_cast(\"bolt\", target)` gates on learned + in-range + sufficient MP, so the branch below only runs when a bolt would actually fly.",
    examples: [{
      code:
        "while enemies().length > 0:\n" +
        "  if can_cast(\"bolt\", enemies()[0]):\n" +
        "    cast(\"bolt\", enemies()[0])\n" +
        "  else:\n" +
        "    approach(enemies()[0])\n" +
        "halt",
    }],
    related: ["commands/cast", "queries/can_cast", "spells/bolt"],
  },
  loot_after: {
    id: "loot_after", name: "Grab loot after clearing",
    blurb: "Fight first, then sweep the floor.",
    body: "After the fight, walks to each nearby drop and picks it up. `pickup()` with a specific FloorItem requires standing on that tile.",
    examples: [{
      code:
        "while enemies().length > 0:\n" +
        "  approach(enemies()[0])\n" +
        "  attack(enemies()[0])\n" +
        "\n" +
        "for f in items_nearby():\n" +
        "  approach(f)\n" +
        "  pickup(f)\n" +
        "halt",
    }],
    related: ["commands/pickup", "queries/items_nearby", "data/flooritem"],
  },
  flee_specific: {
    id: "flee_specific", name: "Flee from bats",
    blurb: "Engage when the nearest foe isn't a dangerous one; flee otherwise.",
    body: "Uses `actor.kind` to branch. Actor-kind strings match the monster template id (\"bat\", \"goblin\", \"slime\", ...).",
    examples: [{
      code:
        "while enemies().length > 0:\n" +
        "  e = enemies()[0]\n" +
        "  if e.kind == \"bat\":\n" +
        "    flee(e)\n" +
        "  else:\n" +
        "    approach(e)\n" +
        "    attack(e)\n" +
        "halt",
    }],
    related: ["commands/flee", "queries/enemies", "data/actor"],
  },
};
