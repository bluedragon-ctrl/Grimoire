// Auto-generated catalogs: turn each entry in SPELLS / ITEMS /
// MONSTER_TEMPLATES into a HelpEntry. If the registry entry ships a `help?`
// field, its blurb/examples/related merge in; otherwise we derive a minimal
// blurb from other fields (name, stats, description). Required registry
// fields stay required — this reader is purely additive.

import type { HelpEntry, HelpExample } from "./types.js";
import type { ProcSpec } from "../../types.js";
import { SPELLS } from "../../content/spells.js";
import { ITEMS, SLOTS } from "../../content/items.js";
import { MONSTER_TEMPLATES } from "../../content/monsters.js";

function makeExamples(exs: HelpExample[] | undefined): HelpExample[] {
  return exs ? exs.map(e => ({ code: e.code, ...(e.caption ? { caption: e.caption } : {}) })) : [];
}

export function spellEntries(): HelpEntry[] {
  const out: HelpEntry[] = [];
  for (const s of Object.values(SPELLS)) {
    const auto = `${s.description} (${s.targetType}, range ${s.range}, ${s.mpCost} MP)`;
    const blurb = s.help?.blurb ?? auto;
    const examples: HelpExample[] = s.help?.examples
      ? makeExamples(s.help.examples)
      : autoSpellExample(s.name, s.targetType);
    const isAoe = Array.isArray(s.body) && s.body.some((step: { op: string }) => step.op === "explode");
    const defaultRelated = isAoe
      ? ["commands/cast", "data/actor", "data/aoe"]
      : ["commands/cast", "data/actor"];
    const related = s.help?.related ?? defaultRelated;
    out.push({
      id: s.name,
      path: `spells/${s.name}`,
      category: "spells",
      name: s.name,
      blurb,
      signature: `cast("${s.name}"${s.targetType === "self" ? "" : ", target"})`,
      body: s.description,
      examples,
      related,
      meta: [
        ["target", s.targetType],
        ["range", String(s.range)],
        ["mp cost", String(s.mpCost)],
      ],
    });
  }
  return out;
}

function autoSpellExample(name: string, tgt: string): HelpExample[] {
  if (tgt === "self") {
    return [{ code: `cast("${name}")` }];
  }
  if (tgt === "tile") {
    return [{ caption: "Cast on the enemy's tile.", code: `cast("${name}", enemies()[0])` }];
  }
  return [{ caption: "Cast on the nearest enemy.", code: `if me.can_cast("${name}", enemies()[0]):\n  cast("${name}", enemies()[0])` }];
}

function procLine(name: string, proc: ProcSpec): string {
  const parts: string[] = [name];
  if (proc.chance !== undefined && proc.chance < 100) parts.push(`${proc.chance}% chance`);
  parts.push(`→ ${proc.target}`);
  if (proc.effect) {
    parts.push(`apply ${proc.effect.kind} ${proc.effect.duration}t${proc.effect.magnitude !== undefined ? ` (×${proc.effect.magnitude})` : ""}`);
  }
  if (proc.damage !== undefined) {
    parts.push(proc.damage < 0 ? `heal ${-proc.damage}` : `damage ${proc.damage}`);
  }
  return parts.join(", ");
}

export function itemEntries(): HelpEntry[] {
  const out: HelpEntry[] = [];
  for (const d of Object.values(ITEMS)) {
    const auto = d.description;
    const blurb = d.help?.blurb ?? auto;
    const examples: HelpExample[] =
      d.help?.examples
        ? makeExamples(d.help.examples)
        : d.kind === "consumable"
          ? [{ code: `use("${d.id}")` }]
          : [];
    const related = d.help?.related ?? (d.kind === "consumable" ? ["commands/use"] : ["data/item"]);
    const meta: Array<[string, string]> = [["kind", d.kind]];

    if (d.kind === "equipment") {
      if (d.slot) meta.push(["slot", d.slot]);
      meta.push(["level", String(d.level)]);
      if (d.bonuses) {
        const bonusList = Object.entries(d.bonuses).map(([k, v]) => `${k}:+${v}`).join(", ");
        meta.push(["bonuses", bonusList]);
      }
      if (d.aura) meta.push(["aura", `${d.aura.kind}${d.aura.magnitude !== undefined ? ` ×${d.aura.magnitude}` : ""}`]);
      if (d.on_hit)    meta.push(["on_hit",    procLine("on_hit",    d.on_hit)]);
      if (d.on_damage) meta.push(["on_damage", procLine("on_damage", d.on_damage)]);
      if (d.on_kill)   meta.push(["on_kill",   procLine("on_kill",   d.on_kill)]);
      if (d.on_cast)   meta.push(["on_cast",   procLine("on_cast",   d.on_cast)]);
      if (d.script)    meta.push(["script", d.script]);
    }
    out.push({
      id: d.id,
      path: `items/${d.id}`,
      category: "items",
      name: d.name,
      blurb,
      body: d.description,
      examples,
      related,
      meta,
    });
  }
  return out;
}

// Referenced for coverage in the slot list; keeps linter happy, and an
// authoring error (slot typo) would show up via the items catalog iteself.
void SLOTS;

export function monsterEntries(): HelpEntry[] {
  const out: HelpEntry[] = [];
  for (const t of Object.values(MONSTER_TEMPLATES)) {
    const s = t.stats;
    const auto = `${t.name}: ${s.hp} HP, ${s.atk ?? 0} atk, speed ${s.speed}${t.knownSpells ? ", casts " + t.knownSpells.join("/") : ""}.`;
    const blurb = t.help?.blurb ?? auto;
    const meta: Array<[string, string]> = [
      ["hp", `${s.hp} / ${s.maxHp}`],
      ["speed", String(s.speed)],
    ];
    if (s.atk !== undefined) meta.push(["atk", String(s.atk)]);
    if (s.def !== undefined) meta.push(["def", String(s.def)]);
    if (s.int !== undefined) meta.push(["int", String(s.int)]);
    if (s.mp !== undefined)  meta.push(["mp",  `${s.mp} / ${s.maxMp ?? s.mp}`]);
    if (t.knownSpells && t.knownSpells.length) meta.push(["spells", t.knownSpells.join(", ")]);
    if (t.loot) meta.push(["loot", t.loot]);
    const examples = t.help?.examples ? makeExamples(t.help.examples) : [];
    const related = t.help?.related ?? ["queries/enemies", "data/actor"];
    out.push({
      id: t.id,
      path: `monsters/${t.id}`,
      category: "monsters",
      name: t.name,
      blurb,
      body: `AI script (same DSL your hero uses):\n\n\`\`\`\n${(t.ai ?? "").trim()}\n\`\`\``,
      examples,
      related,
      meta,
    });
  }
  return out;
}
