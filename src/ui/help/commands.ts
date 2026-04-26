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
    related: ["commands/flee", "commands/attack", "queries/at", "data/actor"],
  },

  flee: {
    id: "flee",
    name: "flee",
    signature: "flee(target)",
    blurb: "Take one step away from target. Costs 10 energy.",
    body:
      "Mirror of approach: one step per call, 8-directional, same tie-breaking. Use inside a loop to retreat over multiple ticks.",
    examples: [
      { caption: "Retreat from the nearest enemy while bleeding.", code: "while me.hp < 5 and len(enemies()) > 0:\n  flee(enemies()[0])" },
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
      { caption: "Walk-and-whack loop.", code: "while len(enemies()) > 0:\n  approach(enemies()[0])\n  attack(enemies()[0])" },
    ],
    related: ["commands/approach", "queries/enemies", "events/hit", "data/actor", "data/failure"],
  },

  cast: {
    id: "cast",
    name: "cast",
    signature: "cast(spellName, target?)",
    blurb: "Cast a known spell. Costs 15 energy + the spell's MP.",
    body:
      "`spellName` must be a string matching a learned spell (see `known_spells()`). `target` depends on the spell's targetType — self, ally, enemy, any, or tile. `heal` defaults its target to self if omitted.\n\nFailed casts (out of range, out of MP, unknown spell, target resolution fail) emit ActionFailed only — the action-slot cost is refunded, so a `me.can_cast(...)` gate followed by a blind `cast(...)` doesn't drain energy while the hero tries.\n\nIn an `if`/`while` condition, `cast(...)` resolves to `True` on success and `False` on a clean fail, so you can branch on the outcome.",
    examples: [
      { caption: "Bolt the closest enemy when you can afford it.", code: "if me.can_cast(\"bolt\", enemies()[0]):\n  cast(\"bolt\", enemies()[0])" },
      { caption: "Heal yourself.", code: "cast(\"heal\")" },
    ],
    related: ["queries/known_spells", "queries/mp", "data/actor", "data/failure", "spells/bolt", "spells/heal"],
  },

  use: {
    id: "use",
    name: "use",
    signature: "use(item)",
    blurb: "Consume an item from your bag. Costs 15 energy.",
    body:
      "`item` is either an ItemInstance from `items()`/inventory or a bare defId string (the first matching bag instance is chosen). Running a use-script mid-run can apply effects, restore resources, or cleanse. Failed uses (no such item, empty bag) refund the action slot.",
    examples: [
      { caption: "Pop a health potion when low.", code: "if me.hp < 8:\n  use(\"health_potion\")" },
    ],
    related: ["items/health_potion", "items/mana_crystal", "data/item", "data/failure"],
  },

  pickup: {
    id: "pickup",
    name: "pickup",
    signature: "pickup(target?)",
    blurb: "Pick up a floor-item. Costs 10 energy.",
    body:
      "With no argument, picks up the topmost item on the hero's tile (LIFO). With a FloorItem arg (from `items_here()` / `items_nearby()`), picks that specific drop — the hero must be standing on it.\n\nRouting depends on the item kind:\n\n- **Consumables / scrolls** go into the bag (4 slots). A bag-full failure refunds the action slot so a retry loop doesn't drain energy.\n- **Equipment** is queued for post-run processing (no bag slot used, never fails for fullness). Scrolls and equipment are both reconciled at `exit()`: scrolls become learned spells, equipment becomes known gear available in the prep-panel picker.",
    examples: [
      { caption: "Grab whatever's under you.", code: "pickup()" },
      { caption: "Scoop drops after clearing the room.", code: "for loot in items_here():\n  pickup(loot)" },
    ],
    related: ["commands/drop", "queries/items_here", "queries/items_nearby", "data/flooritem", "data/failure"],
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
      "Position-driven: whichever door tile the hero currently occupies is the one used. The argument is accepted for back-compat (`exit(\"N\")` / `exit(doors()[0])`) but ignored. Fails if not standing on a door.\n\nOn a successful exit, two auto-processing passes run before `HeroExited`: scrolls in the bag become `SpellLearned` (or `ScrollDiscarded` if duplicate), and equipment picked up this run becomes `GearLearned` (or duplicate-discarded), folded into the hero's known-gear list for the next prep phase.",
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
      { caption: "Stall while burning ticks down on a foe.", code: "while enemies()[0].has_effect(\"burning\"):\n  wait()" },
    ],
    related: ["data/actor"],
  },

  halt: {
    id: "halt",
    name: "halt",
    signature: "halt",
    blurb: "Stop the main body. Zero cost.",
    body:
      "Ends the hero's main script. Event handlers (e.g., `on hit`) continue to fire — halt only closes the main body's turn machine. Writing `halt` at the end of a loop is the canonical way to idle once enemies are cleared.",
    examples: [
      { caption: "Clean end after clearing.", code: "while len(enemies()) > 0:\n  approach(enemies()[0])\n  attack(enemies()[0])\nhalt" },
    ],
    related: ["events/registry", "events/hit", "events/see", "commands/notify"],
  },

  summon: {
    id: "summon",
    name: "summon",
    signature: "summon(template, target)",
    blurb: "Spawn a monster as an ally on a target tile. Costs 15 energy + template's MP.",
    body:
      "`template` is a monster id string (e.g., \"goblin\"). `target` is any tile position. The spawned actor shares the caster's faction and is removed when the caster dies or exits the room.\n\nA per-caster cap limits concurrent summons: `max(1, floor(int/4))`. Exceeding it emits ActionFailed and refunds energy. The tile must be in-bounds and unoccupied. MP cost is the template's `summonMpCost`; direct script calls deduct it immediately. When cast via a `summon_X` spell, the spell's mpCost covers it instead.",
    examples: [
      { caption: "Summon a goblin on an adjacent tile.", code: "summon(\"goblin\", enemies()[0])" },
    ],
    related: ["spells/summon_goblin", "spells/summon_skeleton", "queries/allies"],
  },

  // Phase 15: interact with dungeon objects.
  interact: {
    id: "interact",
    name: "interact",
    signature: "interact(target?)",
    blurb: "Use a chest, fountain, or door adjacent to the hero. Costs 10 energy.",
    body:
      "Single verb for opening chests, tapping fountains, and unlocking doors. With no argument, picks the most relevant adjacent object (the one on the hero's tile, then the nearest neighbor).\n\nLocked chests and doors consume a `key` consumable from the inventory; if no key is present, the action fails cleanly (refunds energy). Fountains never deplete — they restore HP or MP to full and remain visible. Chests vanish on open and dump their loot into the inventory.\n\nUse `objects_nearby()` to discover what's around. Failed interacts (no target, locked + no key) emit ActionFailed and refund.",
    examples: [
      { caption: "Tap a fountain when low on HP.", code: "for obj in objects_nearby():\n  if obj.kind == \"fountain_health\" and me.hp < me.maxHp:\n    interact(obj)" },
      { caption: "Kill the keymaster, then unlock the chest.", code: "while len(enemies()) > 0:\n  approach(enemies()[0])\n  attack(enemies()[0])\nfor obj in objects_nearby():\n  if obj.kind == \"chest\":\n    interact(obj)" },
      { caption: "Open the locked exit door.", code: "for obj in objects_nearby():\n  if obj.kind == \"exit_door_closed\":\n    interact(obj)" },
    ],
    related: ["queries/objects_nearby", "commands/exit", "commands/pickup"],
  },

  notify: {
    id: "notify",
    name: "notify",
    signature: "notify(text, style?, duration?, position?)",
    blurb: "Display a CRT-style overlay message. Free action — zero energy cost.",
    body:
      "Pushes a monospace amber-on-black notification to the screen overlay. Useful for signposting, narrative, and debugging.\n\nArguments (all positional):\n\n- `text` — required string. Leading `>` is added automatically by the UI.\n- `style` — optional: `\"info\"` (default), `\"warning\"`, `\"error\"`, or `\"success\"`.\n- `duration` — seconds on screen; default 2. `0` = persistent until the next notify pushes it off.\n- `position` — `\"top\"` (default), `\"center\"`, or `\"bottom\"`.\n\nMultiple notifies stack vertically (newest on top) and FIFO-clear when duration elapses. Because notify has zero energy cost, calling it in a tight loop is safe — it won't stall the action queue.",
    examples: [
      { caption: "Simple status message.", code: "notify(\"Clearing room...\")" },
      { caption: "Warning when HP is low.", code: "if me.hp < 5:\n  notify(\"LOW HP\", \"warning\")" },
      { caption: "Success flash when boss dies.", code: "notify(\"Boss slain!\", \"success\", 3)" },
      { caption: "Debug variable.", code: "notify(\"target hp: \" + str(enemies()[0].hp))" },
    ],
    related: ["commands/halt", "commands/wait", "data/actor"],
  },
};
