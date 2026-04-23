// UI wiring. Run parses the textarea, swaps the resulting Script into the
// demo's hero, runs the engine synchronously, then hands handle.log to the
// playback controller which paces events through the WireRendererAdapter.
// The event-log panel streams lines as each event is actually applied, so
// the log and visuals stay in sync.

import { runRoom, type EngineHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import { demoSetup } from "../demo.js";
import { parse, ParseError, formatError } from "../lang/index.js";
import { WireRendererAdapter } from "../render/wire-adapter.js";
import { createPlayback, type Playback } from "../render/mount.js";

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

let currentHandle: EngineHandle | null = null;
let currentAdapter: WireRendererAdapter | null = null;
let currentPlayback: Playback | null = null;

function appendLine(text: string, cls?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(): void { logEl.innerHTML = ""; }

function setControlsForIdle() {
  btnRun.disabled = false;
  btnPause.disabled = true;
  btnStop.disabled = true;
  btnPause.textContent = "Pause";
}
function setControlsForPlaying() {
  btnRun.disabled = true;
  btnPause.disabled = false;
  btnStop.disabled = false;
  btnPause.textContent = "Pause";
}
function setControlsForPaused() {
  btnPause.textContent = "Resume";
}

function teardownCurrent() {
  if (currentPlayback) currentPlayback.stop();      // tears the adapter down too
  else if (currentAdapter) currentAdapter.teardown();
  currentPlayback = null;
  currentAdapter = null;
  currentHandle = null;
}

btnRun.addEventListener("click", () => {
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
      return;
    }
    throw err;
  }

  appendLine("— run —");
  const setup = demoSetup();
  setup.actors[0]!.script = heroScript;

  const handle = runRoom(setup, { maxTicks: 2000 });
  currentHandle = handle;

  const adapter = new WireRendererAdapter();
  adapter.mount(gameEl, setup.room, setup.actors);
  currentAdapter = adapter;

  const playback = createPlayback(handle, adapter, {
    speedMs: Number(speedEl.value),
    onEvent: (_event, idx) => {
      const entry = handle.log[idx]!;
      appendLine(formatLogEntry(entry), entry.event.type === "ActionFailed" ? "fail" : undefined);
    },
    onComplete: () => {
      appendLine(`— done (tick=${handle.world.tick}) —`);
      setControlsForIdle();
    },
  });
  currentPlayback = playback;

  playback.play();
  setControlsForPlaying();
});

btnPause.addEventListener("click", () => {
  if (!currentPlayback) return;
  if (currentPlayback.status() === "playing") {
    currentPlayback.pause();
    setControlsForPaused();
  } else if (currentPlayback.status() === "paused") {
    currentPlayback.resume();
    setControlsForPlaying();
  }
});

btnStop.addEventListener("click", () => {
  if (!currentHandle) return;
  currentHandle.abort();
  teardownCurrent();
  appendLine("— stop —");
  setControlsForIdle();
});

speedEl.addEventListener("input", () => {
  const ms = Number(speedEl.value);
  speedOut.textContent = `${ms}ms`;
  if (currentPlayback) currentPlayback.setSpeed(ms);
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
setControlsForIdle();
speedOut.textContent = `${speedEl.value}ms`;
renderInspectorEmpty();
