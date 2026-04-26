// Scroll auto-consume tests.
// doExit processes all scroll items in the hero's bag before HeroExited:
//   • New spell → SpellLearned + ScrollDiscarded(reason:"learned")
//   • Already known → ScrollDiscarded(reason:"duplicate"), no SpellLearned
//   • Non-scroll items in bag are untouched
//   • Multiple scrolls in one exit all processed in order

import { describe, it, expect } from "vitest";
import type { Actor, World } from "../../src/types.js";
import { doExit } from "../../src/commands.js";
import { mintInstance, ensureInventory } from "../../src/items/execute.js";
import { emptyEquipped } from "../../src/content/items.js";
import { script, cHalt } from "../../src/ast-helpers.js";
import { ITEMS } from "../../src/content/items.js";

const S = script(cHalt());

function mkWorld(hero: Actor): World {
  return {
    tick: 0,
    room: {
      w: 10, h: 10,
      doors: [{ dir: "N", pos: { x: 5, y: 0 } }],
      chests: [], clouds: [],
    },
    actors: [hero], log: [], aborted: false, ended: false,
  };
}

function mkHero(pos = { x: 5, y: 0 }, knownSpells: string[] = []): Actor {
  return {
    id: "h", kind: "hero", isHero: true,
    hp: 20, maxHp: 20, speed: 12, energy: 0, alive: true,
    pos, mp: 10, maxMp: 10, atk: 3, def: 0, int: 0,
    effects: [], knownSpells: [...knownSpells], faction: "player",
    inventory: { consumables: [], equipped: emptyEquipped() },
    script: S,
  };
}

// Helper: add a scroll to hero's bag by defId
function addScroll(hero: Actor, defId: string): void {
  const inst = mintInstance(defId);
  ensureInventory(hero).consumables.push(inst);
}

// ─── basic scroll processing ───────────────────────────────────────────────

describe("scroll auto-consume at room exit", () => {
  it("learning a new spell: emits SpellLearned + ScrollDiscarded(learned)", () => {
    // Find any scroll item in ITEMS
    const scrollDef = Object.values(ITEMS).find(d => d.kind === "scroll" && d.spell);
    if (!scrollDef) return; // no scrolls defined yet — test is a no-op until commit 7

    const hero = mkHero();
    addScroll(hero, scrollDef.id);
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    const learned = events.filter(e => e.type === "SpellLearned");
    const discarded = events.filter(e => e.type === "ScrollDiscarded");

    expect(learned.length).toBe(1);
    expect((learned[0] as any).spell).toBe(scrollDef.spell);
    expect(discarded.length).toBe(1);
    expect((discarded[0] as any).reason).toBe("learned");
    expect((discarded[0] as any).defId).toBe(scrollDef.id);

    // Spell now in knownSpells
    expect(hero.knownSpells).toContain(scrollDef.spell);
    // Scroll removed from bag
    expect(hero.inventory!.consumables.length).toBe(0);
    // HeroExited still emitted
    expect(events.some(e => e.type === "HeroExited")).toBe(true);
  });

  it("duplicate scroll: ScrollDiscarded(duplicate), no SpellLearned", () => {
    const scrollDef = Object.values(ITEMS).find(d => d.kind === "scroll" && d.spell);
    if (!scrollDef) return;

    // Hero already knows the spell
    const hero = mkHero({ x: 5, y: 0 }, [scrollDef.spell!]);
    addScroll(hero, scrollDef.id);
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    expect(events.filter(e => e.type === "SpellLearned").length).toBe(0);
    const discarded = events.filter(e => e.type === "ScrollDiscarded");
    expect(discarded.length).toBe(1);
    expect((discarded[0] as any).reason).toBe("duplicate");
    // Scroll still removed from bag
    expect(hero.inventory!.consumables.length).toBe(0);
  });

  it("two scrolls: one new, one duplicate — only new one emits SpellLearned", () => {
    const scrollDefs = Object.values(ITEMS).filter(d => d.kind === "scroll" && d.spell);
    if (scrollDefs.length < 2) return;

    const [def1, def2] = scrollDefs as [typeof scrollDefs[0], typeof scrollDefs[0]];
    // Hero already knows def1's spell
    const hero = mkHero({ x: 5, y: 0 }, [def1.spell!]);
    addScroll(hero, def1.id);
    addScroll(hero, def2.id);
    const w = mkWorld(hero);

    const events = doExit(w, hero);
    const learned = events.filter(e => e.type === "SpellLearned");
    const discarded = events.filter(e => e.type === "ScrollDiscarded");

    expect(learned.length).toBe(1);
    expect((learned[0] as any).spell).toBe(def2.spell);
    expect(discarded.length).toBe(2);
    // Both scrolls removed
    expect(hero.inventory!.consumables.length).toBe(0);
  });

  it("non-scroll items in bag are untouched", () => {
    const hero = mkHero();
    const potionInst = mintInstance("health_potion");
    ensureInventory(hero).consumables.push(potionInst);
    const w = mkWorld(hero);

    doExit(w, hero);
    // health_potion is not a scroll — stays in bag
    expect(hero.inventory!.consumables.length).toBe(1);
    expect(hero.inventory!.consumables[0]!.defId).toBe("health_potion");
  });

  it("no scrolls in bag → just HeroExited", () => {
    const hero = mkHero();
    const w = mkWorld(hero);
    const events = doExit(w, hero);
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe("HeroExited");
  });

  it("not on door tile → ActionFailed (scrolls not processed)", () => {
    const hero = mkHero({ x: 3, y: 3 }); // not on door
    const scrollDef = Object.values(ITEMS).find(d => d.kind === "scroll" && d.spell);
    if (scrollDef) addScroll(hero, scrollDef.id);
    const w = mkWorld(hero);
    const events = doExit(w, hero);
    expect((events[0] as any).type).toBe("ActionFailed");
    // Scrolls unchanged
    if (scrollDef) expect(hero.inventory!.consumables.length).toBe(1);
  });
});
