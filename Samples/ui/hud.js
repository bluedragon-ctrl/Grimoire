// HUD — heads-up display panel showing player stats and info.

import { STATUS_DEFS } from '../config/statuses.js';

let contextEl, statsEl, infoEl;

export function initHud() {
  contextEl = document.getElementById('hud-context');
  statsEl = document.getElementById('hud-stats');
  infoEl = document.getElementById('hud-info');
}

function statTotal(entity, stat) {
  return (entity[stat] || 0) + ((entity.equipment && entity.equipment[stat]) || 0);
}

export function updateHud(state) {
  const p = state.player;
  const maxHp = statTotal(p, 'maxHp');
  const maxMp = statTotal(p, 'maxMp');

  contextEl.textContent = [
    `Pos: (${p.x}, ${p.y})`,
    `D:${state.depth}  Turn:${state.turn}  Tk:${state.tick ?? 0}`,
  ].join('\n');

  statsEl.textContent = [
    `HP: ${p.hp}/${maxHp}   MP: ${p.mp}/${maxMp}`,
    `ATK:${statTotal(p,'atk')}  DEF:${statTotal(p,'def')}  SPD:${statTotal(p,'spd')}  INT:${statTotal(p,'int')}`,
  ].join('\n');

  const infoLines = [];

  if (p.statuses && p.statuses.length > 0) {
    for (const s of p.statuses) {
      const def = STATUS_DEFS[s.id];
      infoLines.push(`${def ? def.name : s.id} (${s.duration}t)`);
    }
  }

  // Resistances — show only non-zero entries, sorted by key for stability.
  // Negative values are vulnerabilities and worth surfacing: e.g. `fire -3`.
  if (p.resistances) {
    const entries = Object.entries(p.resistances)
      .filter(([, v]) => v !== 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.length > 0) {
      if (infoLines.length > 0) infoLines.push('');
      infoLines.push('Resist:');
      for (const [k, v] of entries) {
        const sign = v > 0 ? '+' : '';
        infoLines.push(`  ${k} ${sign}${v}`);
      }
    }
  }

  infoEl.textContent = infoLines.join('\n');
}
