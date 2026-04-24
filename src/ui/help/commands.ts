// Hand-authored help for every command (action with cost). Names match the
// engine's command-name strings exactly so event-log "action" fields line up.
// Cost strings come from COST in src/commands.ts — quoted here as text so
// help renders the same whether or not the tree is loaded.

import type { HelpEntry } from "./types.js";

type CommandHelp = Omit<HelpEntry, "category" | "path" | "examples" | "related"> & {
  signature: string;
  examples: HelpEntry["examples"];
  related?: string[];
};

export const COMMAND_HELP: Record<string, CommandHelp> = {
  approach: {
    id: "approach",
    name: "approach",
    signature: "approach(target)",
    blurb: "Take one step toward target. Costs 10 energy.",
    body:
      "Moves one tile closer to the target position. Accepts any positioned value: an actor, door, item, chest, or bare `{x,y}`. Movement is 8-directional; ties resolve on the larger axis first, then x.\n\nA blocked step (tile occupied or out of bounds) emits ActionFailed but still costs.",
    examples: [
      { caption: "Close the gap on the nearest foe.", code: "approach(enemies()[0])" },
      { caption: "Walk to a specific door.",          code: "approach(doors()[0])" },
    ],
    related: ["commands/flee", "commands/attack", "queries/at", "queries/distance", "data/actor"],
  },

  flee: {
    id: "flee",
    name: "flee",
    signature: "flee(target)",
    blurb: "Take one step away from target. Costs 10 energy.",
    body:
      "Mirror of approach: one step per call, 8-directional, same tie-breaking. Use inside a loop to retreat over multiple ticks.",
    examples: [
      { caption: "Retreat from the nearest enemy while bleeding.", code: "while hp() < 5 and enemies().length > 0:\n  flee(enemies()[0])" },
    ],
    related: ["commands/approach", "queries/hp", "queries/enemies"],
  },

  attack: {
    id: "attack",
    name: "attack",
    signature: "attack(target)",
    blurb: "Melee an orthogonally-adjacent actor. Costs 10 energy.",
    body:
      "Deals `self.atk` damage. Fails (ActionFailed, still costs) if the target isn't orthogonally adjacent or not alive. On-hit item procs (e.g., venom dagger) fire after the swing.",
    examples: [
      { caption: "Walk-and-whack loop.", code: "while enemies().length > 0:\n  approach(enemies()[0])\n  attack(enemies()[0])" },
    ],
    related: ["commands/approach", "queries/adjacent", "queries/enemies", "events/hit"],
  },

  cast: {
    id: "cast",
    name: "cast",
    signature: "cast(spellName, target?)",
    blurb: "Cast a known spell. Costs 15 energy + the spell's MP.",
    body:
      "`spellName` must be a string matching a learned spell (see `known_spells()`). `target` depends on the spell's targetType — self, ally, enemy, any, or tile. `heal` defaults its target to self if omitted.\n\nFailed casts (out of range, out of MP, unknown spell, target resolution fail) emit ActionFailed only — the action-slot cost is refunded, so a `can_cast` gate followed by a blind `cast` doesn't drain energy while the hero tries.",
    examples: [
      { caption: "Bolt the closest enemy when you can afford it.", code: "if can_cast(\"bolt\", enemies()[0]):\n  cast(\"bolt\", enemies()[0])" },
      { caption: "Heal yourself.", code: "cast(\"heal\")" },
    ],
    related: ["queries/can_cast", "queries/known_spells", "queries/mp", "spells/bolt", "spells/heal"],
  },

  use: {
    id: "use",
    name: "use",
    signature: "use(item)",
    blurb: "Consume an item from your bag. Costs 15 energy.",
    body:
      "`item` is either an ItemInstance from `items()`/inventory or a bare defId string (the first matching bag instance is chosen). Running a use-script mid-run can apply effects, restore resources, or cleanse. Failed uses (no such item, empty bag) refund the action slot.",
    examples: [
      { caption: "Pop a health potion when low.", code: "if hp() < 8:\n  use(\"health_potion\")" },
    ],
    related: ["items/health_potion", "items/mana_crystal", "data/item"],
  },

  pickup: {
    id: "pickup",
    name: "pickup",
    signature: "pickup(target?)",
    blurb: "Pick up a floor-item. Costs 10 energy.",
    body:
      "With no argument, picks up the topmost item on the hero's tile (LIFO). With a FloorItem arg (from `items_here()` / `items_nearby()`), picks that specific drop — the hero must be standing on it. A bag-full failure refunds the action slot so a retry loop doesn't drain energy.",
    examples: [
      { caption: "Grab whatever's under you.", code: "pickup()" },
      { caption: "Scoop drops after clearing the room.", code: "for loot in items_here():\n  pickup(loot)" },
    ],
    related: ["commands/drop", "queries/items_here", "queries/items_nearby", "data/flooritem"],
  },

  drop: {
    id: "drop",
    name: "drop",
    signature: "drop(item)",
    blurb: "Drop an inventory item onto your tile. Costs 5 energy.",
    body:
      "Takes an ItemInstance (from inventory) or a defId. The dropped item becomes a FloorItem and can be picked up again. Useful for making space before a pickup.",
    examples: [
      { caption: "Drop a known-held item.", code: "drop(\"mana_crystal\")" },
    ],
    related: ["commands/pickup", "data/flooritem"],
  },

  exit: {
    id: "exit",
    name: "exit",
    signature: "exit(doorOrDir?)",
    blurb: "Leave the room through the door you're standing on. Costs 10 energy.",
    body:
      "Position-driven: whichever door tile the hero currently occupies is the one used. The argument is accepted for back-compat (`exit(\"N\")` / `exit(doors()[0])`) but ignored. Fails if not standing on a door.",
    examples: [
      { caption: "Walk to a door, then exit.", code: "while not at(doors()[0]):\n  approach(doors()[0])\nexit(\"N\")" },
    ],
    related: ["queries/doors", "queries/at", "data/door"],
  },

  wait: {
    id: "wait",
    name: "wait",
    signature: "wait()",
    blurb: "Do nothing this tick. Costs 5 energy.",
    body: "A deliberate idle. Useful to hold position, tick down an effect on an enemy, or let an ally pass.",
    examples: [
      { caption: "Stall while burning ticks down on a foe.", code: "while has_effect(enemies()[0], \"burning\"):\n  wait()" },
    ],
    related: ["queries/has_effect", "queries/effects"],
  },

  halt: {
    id: "halt",
    name: "halt",
    signature: "halt",
    blurb: "Stop the main body. Zero cost.",
    body:
      "Ends the hero's main script. Event handlers (e.g., `on hit`) continue to fire — halt only closes the main body's turn machine. Writing `halt` at the end of a loop is the canonical way to idle once enemies are cleared.",
    examples: [
      { caption: "Clean end after clearing.", code: "while enemies().length > 0:\n  approach(enemies()[0])\n  attack(enemies()[0])\nhalt" },
    ],
    related: ["events/hit", "events/died"],
  },
};
