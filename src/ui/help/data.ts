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
    body: "Fields a script may read:\n\n- `id` — unique string\n- `pos.x`, `pos.y` — tile coordinates\n- `hp`, `maxHp`, `mp`, `maxMp`\n- `atk`, `def`, `int` — combat stats (all may be undefined)\n- `alive` — boolean\n- `isHero` — true for the player\n\nActors are live references: reading `pos` on the next tick reflects movement.",
    examples: [
      { caption: "Distance-gate an attack.", code: "if distance(me, enemies()[0]) == 1:\n  attack(enemies()[0])" },
      { caption: "Access HP through the actor.", code: "e = enemies()[0]\nif e.hp < 2:\n  attack(e)" },
    ],
    related: ["queries/me", "queries/enemies", "queries/hp", "queries/distance"],
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
