// Item-script parser. Tiny standalone grammar — not part of the hero-script
// AST. One statement per line; whitespace-separated tokens; blank lines and
// `#`-prefixed comments are skipped.
//
// Grammar (each line is one ItemOp):
//   apply <effectId> <duration>            — consumable: apply an effect
//   restore <pool> <N>                     — consumable: restore hp|mp
//   cleanse <effectId>                     — consumable: remove an effect
//   modify <stat> <N>                      — consumable: permanent base bump
//   merge <stat> <N>                       — wearable: aggregate contribution
//   on_hit inflict <effectId> $TARGET <dur> $L
//                                          — wearable (dagger) proc
//
// Placeholders: $TARGET (bound at hit-time), $L (item level, reserved — must
// appear literally as $L; interpreted as 1). Parse errors include the item
// id and 1-based line number.

import type { EffectKind } from "../types.js";
import { ParseError } from "../lang/errors.js";

export type ItemOp =
  | { op: "apply";   effectId: EffectKind; duration: number }
  | { op: "restore"; pool: "hp" | "mp";   amount: number }
  | { op: "cleanse"; effectId: EffectKind }
  | { op: "modify";  stat: MergeStat;      amount: number }
  | { op: "merge";   stat: MergeStat;      amount: number }
  | { op: "on_hit_inflict"; effectId: EffectKind; duration: number; level: number };

const VALID_EFFECTS: readonly EffectKind[] = ["burning", "regen", "haste", "slow", "poison"];
const VALID_POOLS = ["hp", "mp"] as const;
// Merge/modify stats — kept narrow so typos error cleanly. Extending this
// list is the only code change required to support new aggregated stats.
const VALID_STATS = ["atk", "def", "int", "speed", "maxHp", "maxMp"] as const;

export type MergeStat = (typeof VALID_STATS)[number];

function err(itemId: string, line: number, msg: string): ParseError {
  return new ParseError(line, 1, `[${itemId}] ${msg}`);
}

function parseInt10(itemId: string, line: number, raw: string, label: string): number {
  if (!/^-?\d+$/.test(raw)) throw err(itemId, line, `${label} must be an integer, got '${raw}'`);
  return parseInt(raw, 10);
}

function asEffect(itemId: string, line: number, raw: string): EffectKind {
  if (!(VALID_EFFECTS as readonly string[]).includes(raw)) {
    throw err(itemId, line, `unknown effect '${raw}' (valid: ${VALID_EFFECTS.join(", ")})`);
  }
  return raw as EffectKind;
}

function asStat(itemId: string, line: number, raw: string): MergeStat {
  if (!(VALID_STATS as readonly string[]).includes(raw)) {
    throw err(itemId, line, `unknown stat '${raw}' (valid: ${VALID_STATS.join(", ")})`);
  }
  return raw as MergeStat;
}

export function parseItemScript(itemId: string, source: string): ItemOp[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const ops: ItemOp[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i]!.trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const toks = raw.split(/\s+/);
    const head = toks[0]!;
    switch (head) {
      case "apply": {
        if (toks.length !== 3) throw err(itemId, lineNo, `apply needs <effect> <duration>`);
        ops.push({ op: "apply", effectId: asEffect(itemId, lineNo, toks[1]!), duration: parseInt10(itemId, lineNo, toks[2]!, "duration") });
        break;
      }
      case "restore": {
        if (toks.length !== 3) throw err(itemId, lineNo, `restore needs <pool> <amount>`);
        const pool = toks[1]!;
        if (!(VALID_POOLS as readonly string[]).includes(pool)) {
          throw err(itemId, lineNo, `restore pool must be hp|mp, got '${pool}'`);
        }
        ops.push({ op: "restore", pool: pool as "hp" | "mp", amount: parseInt10(itemId, lineNo, toks[2]!, "amount") });
        break;
      }
      case "cleanse": {
        if (toks.length !== 2) throw err(itemId, lineNo, `cleanse needs <effect>`);
        ops.push({ op: "cleanse", effectId: asEffect(itemId, lineNo, toks[1]!) });
        break;
      }
      case "modify": {
        if (toks.length !== 3) throw err(itemId, lineNo, `modify needs <stat> <amount>`);
        ops.push({ op: "modify", stat: asStat(itemId, lineNo, toks[1]!), amount: parseInt10(itemId, lineNo, toks[2]!, "amount") });
        break;
      }
      case "merge": {
        if (toks.length !== 3) throw err(itemId, lineNo, `merge needs <stat> <amount>`);
        ops.push({ op: "merge", stat: asStat(itemId, lineNo, toks[1]!), amount: parseInt10(itemId, lineNo, toks[2]!, "amount") });
        break;
      }
      case "on_hit": {
        // Signature: on_hit inflict <effect> $TARGET <duration> $L
        if (toks.length !== 6 || toks[1] !== "inflict" || toks[3] !== "$TARGET" || toks[5] !== "$L") {
          throw err(itemId, lineNo, `on_hit must be: on_hit inflict <effect> $TARGET <duration> $L`);
        }
        ops.push({
          op: "on_hit_inflict",
          effectId: asEffect(itemId, lineNo, toks[2]!),
          duration: parseInt10(itemId, lineNo, toks[4]!, "duration"),
          level: 1,
        });
        break;
      }
      default:
        throw err(itemId, lineNo, `unknown op '${head}'`);
    }
  }
  return ops;
}
