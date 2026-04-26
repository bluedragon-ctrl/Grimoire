// Hardcoded demo room + scripts. The UI Run button fires this.

import type { Actor, Room } from "./types.js";
import { parse } from "./lang/parser.js";
import { emptyEquipped } from "./content/items.js";

// Pythonic Phase 13.5 style: clear, idiomatic, copy-pasteable.
const HERO_SOURCE = `
# Clear the room, sweep loot, then leave through the north door.
while len(enemies()) > 0:
  foe = enemies()[0]
  approach(foe)
  attack(foe)

while len(items()) > 0:
  if len(items(0)) == 0:
    approach(items()[0])
  else:
    pickup()

door = doors()[0]
while not at(door):
  approach(door)
exit()
halt
`;

const heroScript = parse(HERO_SOURCE);
const gobScript = parse("halt\n");

export function demoSetup(): { room: Room; actors: Actor[] } {
  const room: Room = {
    w: 10,
    h: 10,
    doors: [
      { dir: "N", pos: { x: 5, y: 0 } },
      { dir: "S", pos: { x: 5, y: 9 } },
    ],
    chests: [],
  };

  const hero: Actor = {
    id: "hero", kind: "hero", isHero: true, hp: 20, maxHp: 20,
    speed: 12, energy: 0, pos: { x: 1, y: 5 },
    script: heroScript, alive: true,
    knownGear: ["wooden_staff", "bone_dagger"],
    inventory: {
      consumables: [],
      equipped: {
        ...emptyEquipped(),
        staff:  { id: "ws1", defId: "wooden_staff" },
        dagger: { id: "bd1", defId: "bone_dagger" },
      },
    },
  };
  const gob: Actor = {
    id: "gob1", kind: "goblin", isHero: false, hp: 5, maxHp: 5,
    speed: 10, energy: 0, pos: { x: 5, y: 5 },
    script: gobScript, alive: true,
  };

  return { room, actors: [hero, gob] };
}
