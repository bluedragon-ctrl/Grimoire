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
        "while len(enemies()) > 0:\n" +
        "  foe = enemies()[0]\n" +
        "  approach(foe)\n" +
        "  attack(foe)\n" +
        "\n" +
        "door = doors()[0]\n" +
        "while not at(door):\n" +
        "  approach(door)\n" +
        "exit(\"N\")\n" +
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
        "while len(enemies()) > 0:\n" +
        "  foe = enemies()[0]\n" +
        "  if me.hp < 6:\n" +
        "    use(\"health_potion\")\n" +
        "  approach(foe)\n" +
        "  attack(foe)\n" +
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
        "while len(enemies()) > 0:\n" +
        "  foe = enemies()[0]\n" +
        "  if me.can_cast(\"bolt\", foe):\n" +
        "    cast(\"bolt\", foe)\n" +
        "  else:\n" +
        "    approach(foe)\n" +
        "halt",
    }],
    related: ["commands/cast", "data/actor", "spells/bolt"],
  },
  loot_after: {
    id: "loot_after", name: "Grab loot after clearing",
    blurb: "Fight first, then sweep the floor.",
    body: "After the fight, walks to each nearby drop and picks it up. `pickup()` with a specific FloorItem requires standing on that tile.",
    examples: [{
      code:
        "while len(enemies()) > 0:\n" +
        "  foe = enemies()[0]\n" +
        "  approach(foe)\n" +
        "  attack(foe)\n" +
        "\n" +
        "for drop in items_nearby():\n" +
        "  approach(drop)\n" +
        "  pickup(drop)\n" +
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
        "while len(enemies()) > 0:\n" +
        "  foe = enemies()[0]\n" +
        "  if foe.kind == \"bat\":\n" +
        "    flee(foe)\n" +
        "  else:\n" +
        "    approach(foe)\n" +
        "    attack(foe)\n" +
        "halt",
    }],
    related: ["commands/flee", "queries/enemies", "data/actor"],
  },
};
