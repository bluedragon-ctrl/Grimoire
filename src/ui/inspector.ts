// Right-pane inspector: hero snapshot + DSL locals when paused.
// Pure DOM rendering — no engine state held here. Callers pass the host
// element on every call so test/main wiring stays explicit.

export interface InspectorSnapshot {
  locals: Record<string, unknown>;
  visible: {
    enemies: unknown[];
    hp: number;
    maxHp: number;
    pos: { x: number; y: number };
  };
}

export function renderInspectorEmpty(host: HTMLElement, msg = "Not paused."): void {
  host.innerHTML = `<div class="inspector-empty">${msg}</div>`;
}

export function renderInspector(host: HTMLElement, snap: InspectorSnapshot): void {
  const rows: string[] = [];
  rows.push("<h3>Hero</h3><table>");
  rows.push(kv("hp", `${snap.visible.hp} / ${snap.visible.maxHp}`));
  rows.push(kv("pos", `(${snap.visible.pos.x}, ${snap.visible.pos.y})`));
  rows.push(kv("enemies", String(snap.visible.enemies.length)));
  rows.push("</table>");
  const localKeys = Object.keys(snap.locals);
  if (localKeys.length > 0) {
    rows.push("<h3>Locals</h3><table>");
    for (const k of localKeys) rows.push(kv(k, fmt(snap.locals[k])));
    rows.push("</table>");
  } else {
    rows.push("<h3>Locals</h3><div class=\"inspector-empty\">(none)</div>");
  }
  host.innerHTML = rows.join("");
}

function kv(k: string, v: string): string {
  return `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
