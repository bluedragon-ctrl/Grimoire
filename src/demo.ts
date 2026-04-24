// Hardcoded demo room + scripts. The UI Run button fires this.

import type { Actor, Room } from "./types.js";
import {
  script, ident, call, lit, while_, if_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "./ast-helpers.js";
import { emptyEquipped } from "./content/items.js";

const enemiesLen = member(call("enemies"), "length");
const firstEnemy = index(call("enemies"), lit(0));
const firstDoor = index(call("doors"), lit(0));
const mePos = member(ident("me"), "pos");
const doorPos = member(firstDoor, "pos");
const hereItemsLen = member(call("items_here"), "length");
const firstHere = index(call("items_here"), lit(0));
const herePos = member(firstHere, "pos");

export function demoSetup(): { room: Room; actors: Actor[] } {
  const room: Room = {
    w: 10,
    h: 10,
    doors: [
      { dir: "N", pos: { x: 5, y: 0 } },
      { dir: "S", pos: { x: 5, y: 9 } },
    ],
    items: [],
    chests: [],
  };

  // Hero: kill the goblin, then (Phase 9) step onto any dropped loot and
  // pickup() it before heading for the exit.
  const heroScript = script(
    while_(bin(">", enemiesLen, lit(0)), [
      cApproach(firstEnemy),
      cAttack(firstEnemy),
    ]),
    // Walk onto the nearest dropped item (if any) and pick it up.
    if_(bin(">", member(call("items_nearby"), "length"), lit(0)), [
      while_(
        bin(">", member(call("items_nearby"), "length"), lit(0)),
        [
          if_(bin("==", hereItemsLen, lit(0)),
            [cApproach(index(call("items_nearby"), lit(0)))],
            [exprStmt(call("pickup"))],
          ),
        ],
      ),
    ]),
    while_(
      bin("||",
        bin("!=", member(mePos, "x"), member(doorPos, "x")),
        bin("!=", member(mePos, "y"), member(doorPos, "y"))),
      [cApproach(firstDoor)],
    ),
    cExit("N"),
    cHalt(),
  );
  void herePos;

  // Goblin: just halt (idle).
  const gobScript = script(cHalt());

  const hero: Actor = {
    id: "hero", kind: "hero", hp: 20, maxHp: 20,
    speed: 12, energy: 0, pos: { x: 1, y: 5 },
    script: heroScript, alive: true,
    // Starting inventory — editable in the prep-phase panel before Run.
    inventory: {
      consumables: [
        { id: "hp1", defId: "health_potion" },
        { id: "mp1", defId: "mana_crystal" },
      ],
      equipped: {
        ...emptyEquipped(),
        staff: { id: "ws1", defId: "wooden_staff" },
        robe:  { id: "lr1", defId: "leather_robe" },
      },
    },
  };
  const gob: Actor = {
    id: "gob1", kind: "goblin", hp: 5, maxHp: 5,
    speed: 10, energy: 0, pos: { x: 5, y: 5 },
    script: gobScript, alive: true,
  };

  return { room, actors: [hero, gob] };
}
