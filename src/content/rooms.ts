// Phase 10: thin dungeon generator. Produces a RoomSetup per level.
//
// Generation is deliberately minimal for this phase — same layout as the
// demo, scaled goblin HP by level so later levels actually push back.
// Later phases will branch on monster templates, room shape, loot tables.
//
// `rng` is a seedable `() => number` (Math.random-compatible). Not used yet
// but threaded so a future generator can vary layout without API churn.

import type { RoomSetup } from "../engine.js";
import type { Actor, Room, Script } from "../types.js";
import {
  script, ident, call, lit, while_, if_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "../ast-helpers.js";
import { emptyEquipped } from "./items.js";

export type Rng = () => number;

// Build the default hero script used when the user has not yet typed their own.
// Kept identical to demoSetup so Phase 9 demo behavior is preserved.
function buildHeroScript(): Script {
  const enemiesLen = member(call("enemies"), "length");
  const firstEnemy = index(call("enemies"), lit(0));
  const firstDoor = index(call("doors"), lit(0));
  const mePos = member(ident("me"), "pos");
  const doorPos = member(firstDoor, "pos");
  const hereItemsLen = member(call("items_here"), "length");

  return script(
    while_(bin(">", enemiesLen, lit(0)), [
      cApproach(firstEnemy),
      cAttack(firstEnemy),
    ]),
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
}

function buildGoblinHp(level: number): number {
  // +2 HP per level, capped loosely. Keep scaling mild — this is a stub.
  return 5 + Math.max(0, level - 1) * 2;
}

export function generateRoom(level: number, _rng: Rng = Math.random): RoomSetup {
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

  const hero: Actor = {
    id: "hero", kind: "hero", hp: 20, maxHp: 20,
    speed: 12, energy: 0, pos: { x: 1, y: 5 },
    script: buildHeroScript(), alive: true,
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

  const gobHp = buildGoblinHp(level);
  const goblin: Actor = {
    id: "gob1", kind: "goblin", hp: gobHp, maxHp: gobHp,
    speed: 10, energy: 0, pos: { x: 5, y: 5 },
    script: script(cHalt()), alive: true,
  };

  return { room, actors: [hero, goblin] };
}
