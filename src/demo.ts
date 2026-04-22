// Hardcoded demo room + scripts. The UI Run button fires this.

import type { Actor, Room } from "./types.js";
import {
  script, ident, call, lit, while_, bin, member, index, exprStmt,
  cApproach, cAttack, cExit, cHalt,
} from "./ast-helpers.js";

const enemiesLen = member(call("enemies"), "length");
const firstEnemy = index(call("enemies"), lit(0));
const firstDoor = index(call("doors"), lit(0));
const mePos = member(ident("me"), "pos");
const doorPos = member(firstDoor, "pos");

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

  // Hero: while enemies exist, approach+attack. Then walk to the north
  // door and exit.
  const heroScript = script(
    while_(bin(">", enemiesLen, lit(0)), [
      cApproach(firstEnemy),
      cAttack(firstEnemy),
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

  // Goblin: just halt (idle).
  const gobScript = script(cHalt());

  const hero: Actor = {
    id: "hero", kind: "hero", hp: 20, maxHp: 20,
    speed: 12, energy: 0, pos: { x: 1, y: 5 },
    script: heroScript, alive: true,
  };
  const gob: Actor = {
    id: "gob1", kind: "goblin", hp: 5, maxHp: 5,
    speed: 10, energy: 0, pos: { x: 5, y: 5 },
    script: gobScript, alive: true,
  };

  return { room, actors: [hero, gob] };
}
