// UI wiring. Drives the Phase 10 gameplay loop: prep → running → (recap | prep).
// Owns a RunController (src/ui/run-state.ts) that tracks level/attempts/snapshot;
// translates button clicks into phase transitions and, separately, into engine
// pause/step/abort calls. The engine itself stays pure — the state machine is
// purely a UI concept.

import { startRoom, type DebugHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import type { RoomSetup } from "../engine.js";
import { parse, ParseError, formatError } from "../lang/index.js";
import { WireRendererAdapter } from "../render/wire-adapter.js";
import { mountInventoryPanel, type InventoryController } from "./inventory.js";
import {
  RunController,
  inspectorTabEnabled, helpTabEnabled,
  type Phase,
} from "./run-state.js";
import { generateRoom } from "../content/rooms.js";

const btnRun      = document.getElementById("btn-run")      as HTMLButtonElement;
const btnPause    = document.getElementById("btn-pause")    as HTMLButtonElement;
const btnStep     = document.getElementById("btn-step")     as HTMLButtonElement;
const btnResume   = document.getElementById("btn-resume")   as HTMLButtonElement;
const btnStop     = document.getElementById("btn-stop")     as HTMLButtonElement;
const btnSkip     = document.getElementById("btn-skip")     as HTMLButtonElement;
const btnReset    = document.getElementById("btn-reset")    as HTMLButtonElement;
const btnContinue = document.getElementById("btn-continue") as HTMLButtonElement;
const speedEl   = document.getElementById("speed-slider")  as HTMLInputElement;
const speedOut  = document.getElementById("speed-readout") as HTMLSpanElement;
const logEl     = document.getElementById("event-log") as HTMLUListElement;
const editorEl  = document.getElementById("editor")    as HTMLTextAreaElement;
const gutterEl  = document.getElementById("gutter")    as HTMLPreElement;
const gameEl    = document.getElementById("game-view") as HTMLDivElement;
const gamePane  = document.getElementById("pane-game") as HTMLElement;
const inspectorEl = document.getElementById("inspector") as HTMLDivElement;
const inventoryEl = document.getElementById("inventory") as HTMLDivElement;
const runMetaEl   = document.getElementById("run-meta") as HTMLSpanElement;
const tabInspector = document.getElementById("tab-inspector") as HTMLButtonElement;
const tabHelp      = document.getElementById("tab-help")      as HTMLButtonElement;
const panelInspector = document.getElementById("panel-inspector") as HTMLDivElement;
const panelHelp      = document.getElementById("panel-help")      as HTMLDivElement;
const recapModal   = document.getElementById("recap-modal")   as HTMLDivElement;
const recapTitle   = document.getElementById("recap-title")   as HTMLHeadingElement;
const recapAttempts = document.getElementById("recap-attempts") as HTMLElement;
const recapTurns    = document.getElementById("recap-turns")    as HTMLElement;

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

// ── Run state + engine handle ───────────────────────────────────────────────

const runCtl = new RunController({ generate: (lvl) => generateRoom(lvl) });

let currentHandle: DebugHandle | null = null;
let currentAdapter: WireRendererAdapter | null = null;
let inventoryCtl: InventoryController | null = null;
let applyCursor = 0;
let playTimer: ReturnType<typeof setTimeout> | null = null;
// Which UI tab the user last selected. Render logic still obeys phase-based
// enablement — this is the preference used when multiple tabs are enabled.
let activeTab: "inspector" | "help" = "help";

function appendLine(text: string, cls?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(): void { logEl.innerHTML = ""; }

function clearPlayTimer() {
  if (playTimer !== null) { clearTimeout(playTimer); playTimer = null; }
}

function teardownCurrent() {
  clearPlayTimer();
  if (currentAdapter) currentAdapter.teardown();
  currentAdapter = null;
  currentHandle = null;
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

// Scan the event log for terminal events so we can distinguish success
// (HeroExited) from failure (HeroDied, aborted, or mere exhaustion).
function terminalOutcome(): "success" | "failure" {
  if (!currentHandle) return "failure";
  for (let i = currentHandle.log.length - 1; i >= 0; i--) {
    const t = currentHandle.log[i]!.event.type;
    if (t === "HeroExited") return "success";
    if (t === "HeroDied")   return "failure";
  }
  return "failure";
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
  const phase = runCtl.getState().phase;
  if (phase !== "running" || !currentHandle) return;
  const r = currentHandle.step();
  drainLogToAdapter();
  if (r.done || currentHandle.done) {
    onRunEnded();
    return;
  }
  playTimer = setTimeout(playTick, Number(speedEl.value));
}

function onRunEnded(): void {
  if (!currentHandle) return;
  const outcome = terminalOutcome();
  const turns = currentHandle.world.tick;
  setActiveGutterLine(null);
  if (outcome === "success") {
    appendLine(`— cleared (tick=${turns}) —`);
    runCtl.succeed(turns);
  } else {
    appendLine(`— failed (tick=${turns}) —`, "fail");
    runCtl.fail();
  }
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
  // Stamp the current editor script onto the prep-phase hero.
  const setup: RoomSetup = runCtl.getState().current;
  setup.actors[0]!.script = heroScript;

  // Transition prep → running. This snapshots the setup for fail-restore.
  runCtl.startRun();

  const handle = startRoom(setup, { maxTicks: 2000 });
  currentHandle = handle;
  const adapter = new WireRendererAdapter();
  adapter.mount(gameEl, handle.world.room, handle.world.actors);
  currentAdapter = adapter;
  applyCursor = 0;
  return true;
}

// ── Button wiring ───────────────────────────────────────────────────────────

btnRun.addEventListener("click", () => {
  if (runCtl.getState().phase !== "prep") return;
  if (!startFromSource()) return;
  playTimer = setTimeout(playTick, Number(speedEl.value));
});

btnPause.addEventListener("click", () => {
  if (runCtl.getState().phase !== "running" || !currentHandle) return;
  clearPlayTimer();
  currentHandle.pause();
  runCtl.pause();
  refreshDebugView();
});

btnStep.addEventListener("click", () => {
  if (runCtl.getState().phase !== "paused" || !currentHandle) return;
  const r = currentHandle.step();
  drainLogToAdapter();
  refreshDebugView();
  if (r.done || currentHandle.done) onRunEnded();
});

btnResume.addEventListener("click", () => {
  if (runCtl.getState().phase !== "paused" || !currentHandle) return;
  setActiveGutterLine(null);
  runCtl.resume();
  playTimer = setTimeout(playTick, Number(speedEl.value));
});

btnStop.addEventListener("click", () => {
  const p = runCtl.getState().phase;
  if (p !== "running" && p !== "paused") return;
  if (currentHandle) currentHandle.abort();
  clearPlayTimer();
  appendLine("— stop —");
  // Stop is treated as failure: attempts++, snapshot restored, back to prep.
  runCtl.fail();
});

btnSkip.addEventListener("click", () => {
  if (runCtl.getState().phase !== "prep") return;
  runCtl.skipRoom();
  appendLine("— skipped room —");
});

btnReset.addEventListener("click", () => {
  // Full teardown: level 1, attempts 1, fresh room, prep phase.
  if (currentHandle) currentHandle.abort();
  runCtl.resetAll();
  clearLog();
});

btnContinue.addEventListener("click", () => {
  if (runCtl.getState().phase !== "recap") return;
  runCtl.continueAfterRecap();
  clearLog();
});

// Tab strip: manual selection allowed only when the tab is enabled.
tabInspector.addEventListener("click", () => {
  if (tabInspector.disabled) return;
  activeTab = "inspector";
  renderPhase();
});
tabHelp.addEventListener("click", () => {
  if (tabHelp.disabled) return;
  activeTab = "help";
  renderPhase();
});

speedEl.addEventListener("input", () => {
  const ms = Number(speedEl.value);
  speedOut.textContent = `${ms}ms`;
  if (runCtl.getState().phase === "running") {
    clearPlayTimer();
    playTimer = setTimeout(playTick, ms);
  }
});

// ── Phase-driven UI rendering ───────────────────────────────────────────────

runCtl.on(renderPhase);

function renderPhase(): void {
  const s = runCtl.getState();
  const phase = s.phase;

  // Controls enablement.
  btnRun.disabled    = phase !== "prep";
  btnPause.disabled  = phase !== "running";
  btnStep.disabled   = phase !== "paused";
  btnResume.disabled = phase !== "paused";
  btnStop.disabled   = !(phase === "running" || phase === "paused");
  btnSkip.disabled   = phase !== "prep";
  btnReset.disabled  = false;

  // Topbar/script-label badge.
  runMetaEl.textContent = `— Level ${s.level}, Attempt ${s.attempts}`;

  // Game pane: expose phase to CSS and clear the canvas during prep/recap.
  gamePane.setAttribute("data-phase", phase);
  if (phase === "prep" || phase === "recap") {
    // Teardown adapter if one's still mounted (e.g., after a Stop).
    if (currentAdapter) {
      currentAdapter.teardown();
      currentAdapter = null;
    }
    currentHandle = null;
    applyCursor = 0;
  }

  // Inventory editable only in prep.
  if (inventoryCtl) {
    inventoryCtl.setEditable(phase === "prep");
    inventoryCtl.refresh();
  }

  // Tabs.
  const helpOn = helpTabEnabled(phase);
  const inspOn = inspectorTabEnabled(phase);
  tabHelp.disabled = !helpOn;
  tabInspector.disabled = !inspOn;
  // Auto-switch to whichever tab is currently enabled.
  let shown: "inspector" | "help" = activeTab;
  if (shown === "inspector" && !inspOn && helpOn) shown = "help";
  if (shown === "help" && !helpOn && inspOn) shown = "inspector";
  tabInspector.classList.toggle("active", shown === "inspector");
  tabHelp.classList.toggle("active", shown === "help");
  panelInspector.hidden = shown !== "inspector";
  panelHelp.hidden = shown !== "help";

  // Recap modal.
  if (phase === "recap" && s.recap) {
    recapTitle.textContent = `LEVEL ${s.recap.level} CLEARED`;
    recapAttempts.textContent = String(s.recap.attempts);
    recapTurns.textContent = String(s.recap.turns);
    recapModal.hidden = false;
  } else {
    recapModal.hidden = true;
  }

  // Inspector rendering: only meaningful during paused; show empty otherwise.
  if (phase !== "paused") {
    renderInspectorEmpty(
      phase === "recap"  ? "Cleared." :
      phase === "prep"   ? "Not running." :
      /* running */        "Running…"
    );
  }
}

// ──────────────────────────── gutter ────────────────────────────

let activeGutterLine: number | null = null;

function renderGutter(): void {
  const lines = editorEl.value.split("\n").length;
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

// Initial state. The inventory panel reads the hero actor from whatever the
// RunController currently holds, so skip/reset/continue transparently swap
// the edit target on the next render.
inventoryCtl = mountInventoryPanel(inventoryEl, () => runCtl.getState().current.actors[0] ?? null);
speedOut.textContent = `${speedEl.value}ms`;
renderPhase();
