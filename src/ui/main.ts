// UI wiring. Run parses the textarea, starts a DebugHandle on the demo setup,
// then drives handle.step() through a setTimeout loop to pace events through
// the WireRendererAdapter. Pause freezes the loop; Step fires one action;
// Reset rebuilds from the initial snapshot.

import { startRoom, type DebugHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import { demoSetup } from "../demo.js";
import type { RoomSetup } from "../engine.js";
import { parse, ParseError, formatError } from "../lang/index.js";
import { WireRendererAdapter } from "../render/wire-adapter.js";
import { mountInventoryPanel, type InventoryController } from "./inventory.js";

const btnRun    = document.getElementById("btn-run")    as HTMLButtonElement;
const btnPause  = document.getElementById("btn-pause")  as HTMLButtonElement;
const btnStep   = document.getElementById("btn-step")   as HTMLButtonElement;
const btnResume = document.getElementById("btn-resume") as HTMLButtonElement;
const btnStop   = document.getElementById("btn-stop")   as HTMLButtonElement;
const btnReset  = document.getElementById("btn-reset")  as HTMLButtonElement;
const speedEl   = document.getElementById("speed-slider")  as HTMLInputElement;
const speedOut  = document.getElementById("speed-readout") as HTMLSpanElement;
const logEl     = document.getElementById("event-log") as HTMLUListElement;
const editorEl  = document.getElementById("editor")    as HTMLTextAreaElement;
const gutterEl  = document.getElementById("gutter")    as HTMLPreElement;
const gameEl    = document.getElementById("game-view") as HTMLDivElement;
const inspectorEl = document.getElementById("inspector") as HTMLDivElement;
const inventoryEl = document.getElementById("inventory") as HTMLDivElement;
const gridEl = document.querySelector("main.grid") as HTMLElement;

const DEFAULT_SCRIPT = [
  "# Hero script — edit and click Run.",
  "while enemies().length > 0:",
  "  approach(enemies()[0])",
  "  attack(enemies()[0])",
  "",
  "while not at(doors()[0]):",
  "  approach(doors()[0])",
  "",
  "exit(\"N\")",
  "halt",
  "",
].join("\n");

editorEl.readOnly = false;
editorEl.placeholder = "# Your script here";
if (editorEl.value.trim() === "") editorEl.value = DEFAULT_SCRIPT;

type Mode = "idle" | "playing" | "paused" | "done";

let currentHandle: DebugHandle | null = null;
let currentAdapter: WireRendererAdapter | null = null;
let currentSetup: RoomSetup | null = null;
let inventoryCtl: InventoryController | null = null;
// The hero actor the inventory panel edits. Prep-phase edits mutate this
// ref; the real `startRoom` clones it when Run fires.
let prepSetup: RoomSetup = demoSetup();
let applyCursor = 0;           // next log index yet to apply to the adapter
let playTimer: ReturnType<typeof setTimeout> | null = null;
let mode: Mode = "idle";

function appendLine(text: string, cls?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(): void { logEl.innerHTML = ""; }

function setControls(m: Mode) {
  mode = m;
  btnRun.disabled    = m === "playing" || m === "paused";
  btnPause.disabled  = m !== "playing";
  btnStep.disabled   = m !== "paused";
  btnResume.disabled = m !== "paused";
  btnStop.disabled   = m === "idle" || m === "done";
  // Inspector is only useful while paused/stepping — hide otherwise so the
  // idle/playing layout gets the full width.
  gridEl.classList.toggle("no-inspector", m !== "paused");
  // Inventory panel is a prep-phase tool: visible only before the first Run
  // or after a Reset lands back in idle. Editable in idle, read-only in
  // done (so the player can see what they had after the run).
  gridEl.classList.toggle("no-inventory", !(m === "idle" || m === "done"));
  if (inventoryCtl) inventoryCtl.setEditable(m === "idle");
}

function clearPlayTimer() {
  if (playTimer !== null) { clearTimeout(playTimer); playTimer = null; }
}

function teardownCurrent() {
  clearPlayTimer();
  if (currentAdapter) currentAdapter.teardown();
  currentAdapter = null;
  currentHandle = null;
  currentSetup = null;
  applyCursor = 0;
  setActiveGutterLine(null);
  renderInspectorEmpty();
}

// Apply every log entry from applyCursor onward to the adapter and the UI.
function drainLogToAdapter(): void {
  if (!currentHandle || !currentAdapter) return;
  const log = currentHandle.log;
  while (applyCursor < log.length) {
    const entry = log[applyCursor++]!;
    currentAdapter.apply(entry.event);
    appendLine(formatLogEntry(entry), entry.event.type === "ActionFailed" ? "fail" : undefined);
  }
}

function refreshDebugView(): void {
  if (!currentHandle) return;
  const loc = currentHandle.currentLoc;
  setActiveGutterLine(loc?.start.line ?? null);
  const snap = currentHandle.inspect("hero");
  if (snap) renderInspector(snap);
}

function playTick(): void {
  playTimer = null;
  if (mode !== "playing" || !currentHandle) return;
  const r = currentHandle.step();
  drainLogToAdapter();
  if (r.done || currentHandle.done) {
    appendLine(`— done (tick=${currentHandle.world.tick}) —`);
    setActiveGutterLine(null);
    renderInspectorEmpty("Done.");
    setControls("done");
    return;
  }
  playTimer = setTimeout(playTick, Number(speedEl.value));
}

function startFromSource(): boolean {
  teardownCurrent();
  clearLog();
  const source = editorEl.value;
  let heroScript;
  try {
    heroScript = parse(source);
  } catch (err) {
    if (err instanceof ParseError) {
      appendLine("— parse error —", "fail");
      for (const line of formatError(source, err).split("\n")) appendLine(line, "fail");
      return false;
    }
    throw err;
  }

  appendLine("— run —");
  // Use the prep-phase setup (edited via the inventory panel) and stamp
  // the current hero script onto it. startRoom clones before mutating.
  const setup = prepSetup;
  setup.actors[0]!.script = heroScript;
  currentSetup = setup;

  const handle = startRoom(setup, { maxTicks: 2000 });
  currentHandle = handle;

  const adapter = new WireRendererAdapter();
  adapter.mount(gameEl, handle.world.room, handle.world.actors);
  currentAdapter = adapter;
  applyCursor = 0;
  return true;
}

btnRun.addEventListener("click", () => {
  if (!startFromSource()) return;
  setControls("playing");
  playTimer = setTimeout(playTick, Number(speedEl.value));
});

btnPause.addEventListener("click", () => {
  if (mode !== "playing" || !currentHandle) return;
  clearPlayTimer();
  currentHandle.pause();
  refreshDebugView();
  setControls("paused");
});

btnStep.addEventListener("click", () => {
  if (mode !== "paused" || !currentHandle) return;
  const r = currentHandle.step();
  drainLogToAdapter();
  refreshDebugView();
  if (r.done || currentHandle.done) {
    appendLine(`— done (tick=${currentHandle.world.tick}) —`);
    setActiveGutterLine(null);
    renderInspectorEmpty("Done.");
    setControls("done");
  }
});

btnResume.addEventListener("click", () => {
  if (mode !== "paused" || !currentHandle) return;
  setActiveGutterLine(null);
  setControls("playing");
  playTimer = setTimeout(playTick, Number(speedEl.value));
});

btnStop.addEventListener("click", () => {
  if (!currentHandle) return;
  currentHandle.abort();
  clearPlayTimer();
  appendLine("— stop —");
  setActiveGutterLine(null);
  renderInspectorEmpty("Stopped.");
  setControls("done");
});

btnReset.addEventListener("click", () => {
  // Reset always reparses current source — Phase 4 spec says reset restarts
  // the interpreter on the initial state, and edits-then-reset should use
  // the new source.
  if (!startFromSource()) return;
  setControls("idle");
});

speedEl.addEventListener("input", () => {
  const ms = Number(speedEl.value);
  speedOut.textContent = `${ms}ms`;
  // If we're mid-playback, the next scheduled tick will use the new speed.
  if (mode === "playing") {
    clearPlayTimer();
    playTimer = setTimeout(playTick, ms);
  }
});

// ──────────────────────────── gutter ────────────────────────────

let activeGutterLine: number | null = null;

function renderGutter(): void {
  const lines = editorEl.value.split("\n").length;
  // Build one <span> per line so we can highlight individually.
  const rows: string[] = [];
  for (let i = 1; i <= lines; i++) {
    const cls = i === activeGutterLine ? "gutter-line gutter-active" : "gutter-line";
    rows.push(`<span class="${cls}">${i}</span>`);
  }
  gutterEl.innerHTML = rows.join("");
  gutterEl.scrollTop = editorEl.scrollTop;
}

export function setActiveGutterLine(line: number | null): void {
  activeGutterLine = line;
  renderGutter();
}

editorEl.addEventListener("input", renderGutter);
editorEl.addEventListener("scroll", () => { gutterEl.scrollTop = editorEl.scrollTop; });
renderGutter();

// ──────────────────────────── inspector rendering ────────────────────────────

export function renderInspectorEmpty(msg = "Not paused."): void {
  inspectorEl.innerHTML = `<div class="inspector-empty">${msg}</div>`;
}

export function renderInspector(snap: {
  locals: Record<string, unknown>;
  visible: { enemies: unknown[]; items: unknown[]; hp: number; maxHp: number; pos: { x: number; y: number } };
}): void {
  const rows: string[] = [];
  rows.push("<h3>Hero</h3><table>");
  rows.push(kv("hp", `${snap.visible.hp} / ${snap.visible.maxHp}`));
  rows.push(kv("pos", `(${snap.visible.pos.x}, ${snap.visible.pos.y})`));
  rows.push(kv("enemies", String(snap.visible.enemies.length)));
  rows.push(kv("items", String(snap.visible.items.length)));
  rows.push("</table>");
  const localKeys = Object.keys(snap.locals);
  if (localKeys.length > 0) {
    rows.push("<h3>Locals</h3><table>");
    for (const k of localKeys) rows.push(kv(k, fmt(snap.locals[k])));
    rows.push("</table>");
  } else {
    rows.push("<h3>Locals</h3><div class=\"inspector-empty\">(none)</div>");
  }
  inspectorEl.innerHTML = rows.join("");
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

// Initial state.
inventoryCtl = mountInventoryPanel(inventoryEl, () => prepSetup.actors[0] ?? null);
setControls("idle");
speedOut.textContent = `${speedEl.value}ms`;
renderInspectorEmpty();
