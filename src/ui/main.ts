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
import { mountHelpPane } from "./help/help-pane.js";
import { visualConfig } from "../config/visuals.js";

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
const gridEl       = document.querySelector("main.grid") as HTMLElement;
const auxTitleEl   = document.getElementById("aux-title") as HTMLHeadingElement;
const heroHud      = document.getElementById("hero-hud")    as HTMLDivElement;
const hudHpFill    = document.getElementById("hud-hp-fill") as HTMLDivElement;
const hudHpVal     = document.getElementById("hud-hp-val")  as HTMLSpanElement;
const hudMpFill    = document.getElementById("hud-mp-fill") as HTMLDivElement;
const hudMpVal     = document.getElementById("hud-mp-val")  as HTMLSpanElement;

const DEFAULT_SCRIPT = [
  "# Hero script — edit and click Run.",
  "while enemies().length > 0:",
  "  approach(enemies()[0])",
  "  attack(enemies()[0])",
  "",
  "while not at(doors()[0]):",
  "  approach(doors()[0])",
  "",
  "exit()",
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
// Which aux tab (if any) the user has opened. Closed by default — the pane
// only exists in the grid when this is non-null.
type AuxTab = "inspector" | "help";
let auxOpen: AuxTab | null = null;

function appendLine(text: string, cls?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(): void { logEl.innerHTML = ""; }

// ── Notification overlay ───────────────────────────────────────────────────
const notifyOverlay = document.getElementById("notify-overlay")!;

interface NotifyOpts {
  style?: "info" | "warning" | "error" | "success";
  duration?: number;   // seconds; 0 = persistent until replaced
  position?: "top" | "center" | "bottom";
}

export function pushNotification(text: string, opts: NotifyOpts = {}): void {
  const { style = "info", duration = 2 } = opts;
  const el = document.createElement("div");
  el.className = "notify-item" + (style !== "info" ? ` ${style}` : "");
  el.textContent = text;
  notifyOverlay.prepend(el);

  if (duration > 0) {
    const fadeMs = duration * 1000;
    setTimeout(() => {
      el.classList.add("fading");
      setTimeout(() => el.remove(), 320);
    }, fadeMs);
  }
}

// ── Canvas-slot typewriter (boot banner + compile flash) ──────────────────
// Renders terminal-style lines char-by-char inside the empty #game-view,
// where "> AWAITING RUN SIGNAL <" normally lives. Returns a Promise that
// resolves after the final hold completes (and the screen is cleared).
function typeLinesInCanvas(
  host: HTMLElement,
  lines: string[],
  opts: { charMs?: number; lineGapMs?: number; holdMs?: number; clearOnDone?: boolean } = {},
): Promise<void> {
  const { charMs = 35, lineGapMs = 220, holdMs = 600, clearOnDone = true } = opts;
  return new Promise(resolve => {
    // Reuse an existing .boot-screen if one's still mounted — that lets the
    // idle prompt append to the boot banner's lines instead of replacing
    // them, so the canvas reads as one continuous console transcript.
    let screen = host.querySelector<HTMLDivElement>(".boot-screen");
    if (!screen) {
      screen = document.createElement("div");
      screen.className = "boot-screen";
      host.appendChild(screen);
    }

    let cursorTime = 0;
    for (const line of lines) {
      const lineStartAt = cursorTime;
      setTimeout(() => {
        if (!screen.isConnected) return;
        const li = document.createElement("div");
        li.className = "boot-line typing";
        const txt = document.createElement("span");
        txt.className = "boot-text";
        const cur = document.createElement("span");
        cur.className = "boot-cursor";
        cur.textContent = "_";
        li.appendChild(txt);
        li.appendChild(cur);
        // Drop the previous line's cursor — only the active line blinks.
        const prev = screen.querySelector(".boot-line.typing");
        if (prev) prev.classList.remove("typing");
        screen.appendChild(li);
        let i = 0;
        const tick = () => {
          if (!li.isConnected) return;
          i++;
          txt.textContent = line.slice(0, i);
          if (i < line.length) setTimeout(tick, charMs);
        };
        tick();
      }, lineStartAt);
      cursorTime += line.length * charMs + lineGapMs;
    }
    setTimeout(() => {
      if (clearOnDone && screen.isConnected) screen.remove();
      resolve();
    }, cursorTime + holdMs);
  });
}

// ── Boot banner ────────────────────────────────────────────────────────────
let bootBannerShown = false;

function showBootBanner(): Promise<void> {
  const cfg = visualConfig.bootBanner;
  if (!cfg.enabled) return Promise.resolve();
  if (cfg.firstRunOnlyPerSession && bootBannerShown) return Promise.resolve();
  bootBannerShown = true;

  const host = document.getElementById("game-view");
  if (!host || host.children.length > 0) return Promise.resolve();

  const version = "0.13";
  const middle = cfg.middleLines[Math.floor(Math.random() * cfg.middleLines.length)] ?? "LOADING...";
  return typeLinesInCanvas(host, [
    `> GRIMOIRE v${version}`,
    `> COMPILING SCRIPT...`,
    `> ${middle}`,
    `> RUN`,
  ], { holdMs: 300, clearOnDone: false });
}

// ── Idle prompt ────────────────────────────────────────────────────────────
// "> AWAITING RUN SIGNAL <" — typed in below any existing boot lines so the
// canvas reads as one continuous transcript (boot → AWAITING). The cursor
// keeps blinking on this line. Cleared automatically when adapter.mount
// paints over #game-view (replaceChildren), and re-typed when the phase
// returns to prep/recap. Idempotent — no-ops if already present.
const IDLE_LINE = "> AWAITING RUN SIGNAL";
let bootDone = false;
function showIdlePrompt(): void {
  if (!gameEl) return;
  // Suppress until the boot banner has finished typing — otherwise the idle
  // line interleaves with the boot lines on initial load.
  if (!bootDone) return;
  // Skip if the canvas is already mounted (any non-.boot-screen child).
  const onlyChild = gameEl.children[0];
  if (onlyChild && !onlyChild.classList.contains("boot-screen")) return;
  // Skip if the AWAITING line was already typed in.
  const existing = Array.from(gameEl.querySelectorAll(".boot-line .boot-text"))
    .some(el => el.textContent === IDLE_LINE);
  if (existing) return;
  void typeLinesInCanvas(gameEl, [IDLE_LINE], { holdMs: 0, clearOnDone: false });
}

function clearPlayTimer() {
  if (playTimer !== null) { clearTimeout(playTimer); playTimer = null; }
}

// Slider value is a "speed" (higher = faster). Convert to the per-step delay
// the timer consumes: delay = (min + max) - value. So slider at max=1000 →
// 50ms delay (fastest), at min=50 → 1000ms (slowest).
function tickDelayMs(): number {
  const v = Number(speedEl.value);
  return (Number(speedEl.min) + Number(speedEl.max)) - v;
}

function updateHud(): void {
  const hero = currentHandle?.world.actors.find(a => a.isHero);
  if (!hero) return;
  const hpFrac = hero.maxHp > 0 ? Math.max(0, hero.hp) / hero.maxHp : 0;
  const mpFrac = (hero.maxMp ?? 0) > 0 ? Math.max(0, hero.mp ?? 0) / (hero.maxMp ?? 1) : 0;
  hudHpFill.style.transform = `scaleX(${hpFrac})`;
  hudMpFill.style.transform = `scaleX(${mpFrac})`;
  hudHpVal.textContent = `${Math.max(0, hero.hp)} / ${hero.maxHp}`;
  hudMpVal.textContent = `${Math.max(0, hero.mp ?? 0)} / ${hero.maxMp ?? 0}`;
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
    // Notified events render as floating canvas labels next to the actor
    // (see WireRendererAdapter.apply → "Notified"). Direct pushNotification
    // calls (boot banner, COMPILING flash) still use the CSS overlay.
    appendLine(formatLogEntry(entry), entry.event.type === "ActionFailed" ? "fail" : undefined);
  }
}

// Scan the event log for terminal events so we can distinguish success
// (HeroExited) from failure (HeroDied, aborted, or mere exhaustion).
function terminalOutcome(): "success" | "death" | "failure" {
  if (!currentHandle) return "failure";
  for (let i = currentHandle.log.length - 1; i >= 0; i--) {
    const t = currentHandle.log[i]!.event.type;
    if (t === "HeroExited") return "success";
    if (t === "HeroDied")   return "death";
  }
  return "failure";
}

/** Extract a human-readable cause string from a HeroDied event in the log. */
function deathCause(): string {
  if (!currentHandle) return "Unknown cause.";
  for (let i = currentHandle.log.length - 1; i >= 0; i--) {
    const { event } = currentHandle.log[i]!;
    if (event.type === "Attacked") {
      return `Killed by ${event.attacker} in room ${runCtl.getState().level}.`;
    }
  }
  return `Fell in room ${runCtl.getState().level}.`;
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
  updateHud();
  if (r.done || currentHandle.done) {
    onRunEnded();
    return;
  }
  playTimer = setTimeout(playTick, tickDelayMs());
}

// How long to hold the running phase after a terminal event so the hero's
// exit/death animation (~0.8s) and the room deconstruction (~0.9s) can play
// out before the recap modal pops. The dissolve trigger fires partway in,
// just after the actor visual has read.
const DECON_TRIGGER_MS = 800;
const PLAYOUT_MS = 1700;

function onRunEnded(): void {
  if (!currentHandle) return;
  const outcome = terminalOutcome();
  const turns = currentHandle.world.tick;
  setActiveGutterLine(null);
  appendLine(
    outcome === "success" ? `— cleared (tick=${turns}) —` :
    outcome === "death"   ? `— hero died (tick=${turns}) —` :
                            `— failed (tick=${turns}) —`,
    outcome === "success" ? undefined : "fail",
  );

  // Stop / fail outcomes go straight to recap — no dissolve.
  if (outcome !== "success" && outcome !== "death") {
    runCtl.fail();
    return;
  }

  // Trigger deconstruction after the actor's death/exit animation reads.
  setTimeout(() => {
    if (currentAdapter) currentAdapter.startRoomDeconstruction();
  }, DECON_TRIGGER_MS);

  // Hold the recap modal until the room finishes dissolving.
  setTimeout(() => {
    if (outcome === "success") runCtl.succeed(turns);
    else runCtl.die(turns, deathCause());
  }, PLAYOUT_MS);
}

async function startFromSource(): Promise<boolean> {
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

  // COMPILING flash inside the canvas slot — confirms the script was accepted
  // before the room appears. We wait for it to finish before mounting so the
  // typewriter line isn't clobbered by adapter.mount's replaceChildren.
  await typeLinesInCanvas(gameEl, ["> COMPILING SCRIPT..."], { holdMs: 250 });

  // Transition prep → running. This snapshots the setup for fail-restore.
  runCtl.startRun();

  const handle = startRoom(setup, { maxTicks: 2000 });
  currentHandle = handle;
  const adapter = new WireRendererAdapter();
  adapter.mount(gameEl, handle.world.room, handle.world.actors);
  currentAdapter = adapter;
  applyCursor = 0;
  updateHud();
  return true;
}

const SPAWN_HOLD_MS = WireRendererAdapter.SPAWN_HOLD_MS;

// ── Button wiring ───────────────────────────────────────────────────────────

btnRun.addEventListener("click", async () => {
  if (runCtl.getState().phase !== "prep") return;
  const ok = await startFromSource();
  if (!ok) return;
  // Hold for spawn animation (glitch_pulse + materialize) before first tick.
  playTimer = setTimeout(playTick, Math.max(tickDelayMs(), SPAWN_HOLD_MS));
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
  updateHud();
  refreshDebugView();
  if (r.done || currentHandle.done) onRunEnded();
});

btnResume.addEventListener("click", () => {
  if (runCtl.getState().phase !== "paused" || !currentHandle) return;
  setActiveGutterLine(null);
  runCtl.resume();
  playTimer = setTimeout(playTick, tickDelayMs());
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

// Topbar tabs: click toggles the aux side pane. A second click on the same
// tab (or clicking the active tab) closes it.
tabInspector.addEventListener("click", () => {
  if (tabInspector.disabled) return;
  auxOpen = auxOpen === "inspector" ? null : "inspector";
  renderPhase();
});
tabHelp.addEventListener("click", () => {
  if (tabHelp.disabled) return;
  auxOpen = auxOpen === "help" ? null : "help";
  renderPhase();
  // Refresh so the spells filter picks up any new learned spells / equip changes.
  if (auxOpen === "help") helpPane.refresh();
});

speedEl.addEventListener("input", () => {
  const delay = tickDelayMs();
  speedOut.textContent = `${delay}ms`;
  if (runCtl.getState().phase === "running") {
    clearPlayTimer();
    playTimer = setTimeout(playTick, delay);
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
    // Re-type the idle prompt unless the boot banner is still playing in
    // this slot (#game-view will already have a .boot-screen child).
    showIdlePrompt();
  }

  // Inventory visible only in prep (and editable there); hidden during the
  // run and recap so the player isn't fiddling with gear mid-fight. The
  // hero HUD (HP/MP) takes over on the canvas overlay during running/paused.
  gridEl.classList.toggle("no-inventory", phase !== "prep");
  if (inventoryCtl) {
    inventoryCtl.setEditable(phase === "prep");
    inventoryCtl.refresh();
  }

  // Hero HUD overlay on the canvas. Visible only when a run is underway
  // (running/paused) — in prep the canvas is black, in recap the modal owns
  // the foreground.
  const hudOn = phase === "running" || phase === "paused";
  heroHud.hidden = !hudOn;
  if (hudOn) updateHud();

  // Topbar tabs + aux side pane. Pane is closed-by-default; a click on an
  // enabled tab opens it showing that content. If the active tab's enablement
  // rule flips off mid-run (e.g., user was on Inspector while paused, then
  // clicked Resume), auto-close the pane.
  const helpOn = helpTabEnabled(phase);
  const inspOn = inspectorTabEnabled(phase);
  tabHelp.disabled = !helpOn;
  tabInspector.disabled = !inspOn;
  if (auxOpen === "inspector" && !inspOn) auxOpen = null;
  if (auxOpen === "help" && !helpOn) auxOpen = null;
  tabInspector.classList.toggle("active", auxOpen === "inspector");
  tabHelp.classList.toggle("active", auxOpen === "help");
  tabInspector.setAttribute("aria-pressed", auxOpen === "inspector" ? "true" : "false");
  tabHelp.setAttribute("aria-pressed", auxOpen === "help" ? "true" : "false");
  gridEl.setAttribute("data-aux", auxOpen ?? "none");
  panelInspector.hidden = auxOpen !== "inspector";
  panelHelp.hidden = auxOpen !== "help";
  auxTitleEl.textContent = auxOpen === "help" ? "Help" : "Inspector";

  // Recap modal — three outcomes: success / death / recall.
  if (phase === "recap" && s.recap) {
    const { outcome, cause } = s.recap;
    if (outcome === "success") {
      recapTitle.textContent = `LEVEL ${s.recap.level} CLEARED`;
      recapTitle.className = "recap-title-success";
    } else {
      recapTitle.textContent = outcome === "death" ? "HERO FELL" : "RUN ENDED";
      recapTitle.className = "recap-title-fail";
    }
    recapAttempts.textContent = String(s.recap.attempts);
    recapTurns.textContent = String(s.recap.turns);
    const causeEl = document.getElementById("recap-cause");
    if (causeEl) causeEl.textContent = cause ?? "";
    const ctaEl = document.getElementById("recap-cta");
    if (ctaEl) {
      ctaEl.textContent = outcome === "success"
        ? "Proceed to the next room."
        : "Edit your script in the inventory panel before pressing Run again.";
    }
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
const helpEl = document.getElementById("help") as HTMLDivElement;
const helpPane = mountHelpPane(helpEl, {
  // Only show spells the hero has learned. Reads live from RunController so
  // equipping a focus that grants a spell, or progressing, updates the list
  // on the next re-render (triggered when the Help tab is opened).
  isSpellVisible: (name: string) => {
    const hero = (currentHandle?.world.actors.find(a => a.isHero))
      ?? runCtl.getState().current.actors[0];
    return !!hero?.knownSpells?.includes(name);
  },
});
speedOut.textContent = `${tickDelayMs()}ms`;
// Kick off the boot banner before the first renderPhase so its .boot-screen
// occupies #game-view. renderPhase's showIdlePrompt is suppressed while
// boot is in progress; once boot finishes, we flip the gate and append the
// AWAITING line below the boot transcript.
const bootPromise = showBootBanner();
renderPhase();
bootPromise.then(() => { bootDone = true; showIdlePrompt(); });
