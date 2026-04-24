// Load-time visual wiring validation.
//
// Ensures every content entry that emits a visual event names a preset that
// actually exists. Called once from src/render/wire-adapter.ts at module init,
// after passing MONSTER_RENDERERS keys so this file stays free of render deps.
//
// Missing mapping → throw with entry name + missing key, same discipline as
// Phase 11.6 content validation.

import type { EffectKind } from "../types.js";
import { SPELLS } from "./spells.js";
import { CLOUD_KINDS } from "./clouds.js";
import { MONSTER_TEMPLATES } from "./monsters.js";
import {
  PROJECTILE_PRESETS,
  BURST_PRESETS,
  CLOUD_PRESETS,
  ELEMENT_DEFAULTS,
  EFFECT_OVERLAY_PRESETS,
  TILE_VISUALS,
  OBJECT_VISUALS,
} from "./visuals.js";

const ALL_EFFECT_KINDS: EffectKind[] = [
  "burning", "poison", "regen", "haste", "slow",
  "chill", "shock", "expose", "might", "iron_skin",
  "mana_regen", "mana_burn", "power", "shield",
];

// ── spell ops ─────────────────────────────────────────────────────────────────

function validateSpellVisuals(): void {
  for (const [id, spell] of Object.entries(SPELLS)) {
    for (const op of spell.body) {
      if (op.op === "project") {
        const visual  = op.args.visual  as string | undefined;
        const element = op.args.element as string | undefined;
        if (!visual && !element) {
          throw new Error(
            `Spell '${id}' op 'project': must declare 'visual' or 'element'.`,
          );
        }
        if (visual && !PROJECTILE_PRESETS[visual]) {
          throw new Error(
            `Spell '${id}' op 'project': visual '${visual}' not found in PROJECTILE_PRESETS.`,
          );
        }
        if (!visual && element && !ELEMENT_DEFAULTS[element]) {
          throw new Error(
            `Spell '${id}' op 'project': element '${element}' has no entry in ELEMENT_DEFAULTS.`,
          );
        }
      } else if (op.op === "spawn_cloud") {
        const visual = op.args.visual as string | undefined;
        if (!visual) {
          throw new Error(
            `Spell '${id}' op 'spawn_cloud': missing 'visual'.`,
          );
        }
        if (!CLOUD_PRESETS[visual]) {
          throw new Error(
            `Spell '${id}' op 'spawn_cloud': visual '${visual}' not found in CLOUD_PRESETS.`,
          );
        }
      } else if (op.op === "explode") {
        const visual = op.args.visual as string | undefined;
        if (!visual) {
          throw new Error(
            `Spell '${id}' op 'explode': missing 'visual'.`,
          );
        }
        if (!BURST_PRESETS[visual]) {
          throw new Error(
            `Spell '${id}' op 'explode': visual '${visual}' not found in BURST_PRESETS.`,
          );
        }
      }
    }
  }
}

// ── cloud kinds ───────────────────────────────────────────────────────────────

function validateCloudVisuals(): void {
  for (const [id, kind] of Object.entries(CLOUD_KINDS)) {
    if (!kind.visual) {
      throw new Error(`Cloud kind '${id}': missing required field 'visual'.`);
    }
    if (!CLOUD_PRESETS[kind.visual]) {
      throw new Error(
        `Cloud kind '${id}': visual '${kind.visual}' not found in CLOUD_PRESETS.`,
      );
    }
  }
}

// ── effect overlays ───────────────────────────────────────────────────────────

function validateEffectOverlays(): void {
  for (const kind of ALL_EFFECT_KINDS) {
    if (!EFFECT_OVERLAY_PRESETS[kind]) {
      throw new Error(
        `EffectKind '${kind}' has no entry in EFFECT_OVERLAY_PRESETS.`,
      );
    }
  }
}

// ── monster sprites ───────────────────────────────────────────────────────────

function validateMonsterTemplates(rendererKeys: Set<string>): void {
  // Every template's visual must resolve to a known renderer.
  for (const [id, tpl] of Object.entries(MONSTER_TEMPLATES)) {
    if (!rendererKeys.has(tpl.visual)) {
      throw new Error(
        `Monster template '${id}': visual '${tpl.visual}' not found in MONSTER_RENDERERS.`,
      );
    }
  }
}

// ── tile / object catalog checks ─────────────────────────────────────────────

function validateTileCatalog(rendererKeys: Set<string>): void {
  for (const [key, spec] of Object.entries(TILE_VISUALS)) {
    if (!rendererKeys.has(spec.renderer)) {
      throw new Error(
        `TILE_VISUALS['${key}'].renderer '${spec.renderer}' not found in TILE_RENDERERS.`,
      );
    }
  }
}

function validateObjectCatalog(rendererKeys: Set<string>): void {
  for (const [key, spec] of Object.entries(OBJECT_VISUALS)) {
    if (!rendererKeys.has(spec.renderer)) {
      throw new Error(
        `OBJECT_VISUALS['${key}'].renderer '${spec.renderer}' not found in OBJECT_RENDERERS.`,
      );
    }
  }
}

// ── public entry point ────────────────────────────────────────────────────────

/**
 * Validate all visual wiring at engine startup.
 * Renderer key sets are passed as parameters to keep this content module
 * free of render-layer imports.
 */
export function validateVisuals(
  monsterRendererKeys: Set<string>,
  tileRendererKeys?: Set<string>,
  objectRendererKeys?: Set<string>,
): void {
  validateSpellVisuals();
  validateCloudVisuals();
  validateEffectOverlays();
  validateMonsterTemplates(monsterRendererKeys);
  if (tileRendererKeys) validateTileCatalog(tileRendererKeys);
  if (objectRendererKeys) validateObjectCatalog(objectRendererKeys);
}
