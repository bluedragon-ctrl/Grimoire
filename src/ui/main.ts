// Phase 15 UI wiring. Drives the run lifecycle:
//   loadout → running → (paused/running) → death_recap → loadout
//                                       ↘ quit_confirm → final_review → loadout
// Successful exit() auto-advances to depth+1 in the same attempt; no per-room
// modal. Death pops the death recap with TRY AGAIN / QUIT.

import { startRoom, type DebugHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import type { RoomSetup } from "../engine.js";
import type { Actor } from "../types.js";
import { parse, ParseError, formatError } from "../lang/index.js";
import { WireRendererAdapter } from "../render/wire-adapter.js";
import { mountInventoryPanel, type InventoryController } from "./inventory.js";
import {
  RunController,
  inspectorTabEnabled, helpTabEnabled,
  type Phase,
} from "./run-state.js";
import { generateRoom } from "../dungeon/generator.js";
import { mountHelpPane } from "./help/help-pane.js";
import { depotConsumableInstances } from "../persistence.js";
import { showBootBanner, showIdlePrompt, typeLinesInCanvas } from "./boot-banner.js";
import {
  ensureQuitButton, showQuitConfirm, hideQuitConfirm,
  showFinalReview, hideFinalReview,
} from "./recap-modals.js";
import { renderInspector, renderInspectorEmpty } from "./inspector.js";

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
  "# Hero script — edit, pick loadout, then BREACH.",
  "while enemies().length > 0:",
  "  approach(enemies()[0])",
  "  attack(enemies()[0])",
  "",
  "for obj in objects_nearby():",
  "  if obj.kind == \"fountain_health\" and me.hp < me.maxHp:",
  "    interact(obj)",
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

const runCtl = new RunController({
  generate: (depth, _run, _loadout) => generateRoom(depth, depth * 0x9E3779B1),
});

let currentHandle: DebugHandle | null = null;
let currentAdapter: WireRendererAdapter | null = null;
let inventoryCtl: InventoryController | null = null;
let applyCursor = 0;
let playTimer: ReturnType<typeof setTimeout> | null = null;
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

const notifyOverlay = document.getElementById("notify-overlay")!;

interface NotifyOpts {
  style?: "info" | "warning" | "error" | "success";
  duration?: number;
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

let bootDone = false;

function clearPlayTimer() {
  if (playTimer !== null) { clearTimeout(playTimer); playTimer = null; }
}

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
  renderInspectorEmpty(inspectorEl);
}

function drainLogToAdapter(): void {
  if (!currentHandle || !currentAdapter) return;
  const log = currentHandle.log;
  while (applyCursor < log.length) {
    const entry = log[applyCursor++]!;
    currentAdapter.apply(entry.event);
    appendLine(formatLogEntry(entry), entry.event.type === "ActionFailed" ? "fail" : undefined);
  }
}

function terminalOutcome(): "success" | "death" | "failure" {
  if (!currentHandle) return "failure";
  for (let i = currentHandle.log.length - 1; i >= 0; i--) {
    const t = currentHandle.log[i]!.event.type;
    if (t === "HeroExited") return "success";
    if (t === "HeroDied")   return "death";
  }
  return "failure";
}

function deathCause(): string {
  if (!currentHandle) return "Unknown cause.";
  for (let i = currentHandle.log.length - 1; i >= 0; i--) {
    const { event } = currentHandle.log[i]!;
    if (event.type === "Attacked") {
      return `Killed by ${event.attacker} at depth ${runCtl.getState().depth}.`;
    }
  }
  return `Fell at depth ${runCtl.getState().depth}.`;
}

function refreshDebugView(): void {
  if (!currentHandle) return;
  const loc = currentHandle.currentLoc;
  setActiveGutterLine(loc?.start.line ?? null);
  const snap = currentHandle.inspect("hero");
  if (snap) renderInspector(inspectorEl, snap);
}

function playTick(): void {
  playTimer = null;
  const phase = runCtl.getState().phase;
  if (phase !== "running" || !currentHandle) return;
  const r = currentHandle.step();
  drainLogToAdapter();
  updateHud();
  // Phase 15: incremental stats — count kills in real time.
  countNewKills();
  if (r.done || currentHandle.done) {
    onRunEnded();
    return;
  }
  playTimer = setTimeout(playTick, tickDelayMs());
}

const DECON_TRIGGER_MS = 800;
const PLAYOUT_MS = 1700;

function countNewKills(): void {
  // Tally kills/items collected from the log between drains.
  if (!currentHandle) return;
  const run = runCtl.getState().run;
  while (statsCursor < currentHandle.log.length) {
    const ev = currentHandle.log[statsCursor++]!.event;
    if (ev.type === "Died" && ev.actor !== "hero") {
      run.stats.totalKills += 1;
    }
    if (ev.type === "ItemPickedUp") {
      run.stats.totalItemsCollected += 1;
    }
  }
}
let statsCursor = 0;

function onRunEnded(): void {
  if (!currentHandle) return;
  const outcome = terminalOutcome();
  const turns = currentHandle.world.tick;
  setActiveGutterLine(null);
  appendLine(
    outcome === "success" ? `— ROOM CLEARED (depth=${runCtl.getState().depth}, tick=${turns}) —` :
    outcome === "death"   ? `— PROCESS TERMINATED (tick=${turns}) —` :
                            `— failed (tick=${turns}) —`,
    outcome === "success" ? undefined : "fail",
  );

  if (outcome !== "success" && outcome !== "death") {
    // Treat exhaustion/abort as death for lifecycle purposes.
    const heroSnap = currentHandle.world.actors.find(a => a.isHero);
    if (heroSnap) runCtl.die(turns, heroSnap, "Halted before exit.");
    return;
  }

  setTimeout(() => {
    if (currentAdapter) currentAdapter.startRoomDeconstruction();
  }, DECON_TRIGGER_MS);

  setTimeout(() => {
    if (!currentHandle) return;
    const heroSnap = currentHandle.world.actors.find(a => a.isHero);
    if (outcome === "success" && heroSnap) {
      // Carry the live hero (with hp/mp/inventory/effects) into the next room.
      // Re-clone via a structural copy to detach from the dying world.
      const carry = cloneHeroForCarry(heroSnap);
      pushNotification("ROOM CLEARED", { style: "success", duration: 1.5 });
      teardownCurrent();
      runCtl.advanceDepth(carry);
    } else if (heroSnap) {
      runCtl.die(turns, heroSnap, deathCause());
    }
  }, PLAYOUT_MS);
}

function cloneHeroForCarry(hero: Actor): Actor {
  return {
    ...hero,
    pos: { ...hero.pos },
    inventory: hero.inventory ? {
      consumables: hero.inventory.consumables.map(i => ({ ...i })),
      equipped: { ...hero.inventory.equipped },
    } : undefined,
    effects: hero.effects ? hero.effects.map(e => ({ ...e })) : undefined,
    knownSpells: hero.knownSpells ? [...hero.knownSpells] : undefined,
    knownGear: hero.knownGear ? [...hero.knownGear] : undefined,
    foundGear: hero.foundGear ? [...hero.foundGear] : undefined,
    energy: 0,
  };
}

async function showCompilingFlash(): Promise<void> {
  // Brief "> COMPILING SCRIPT..." typewriter flash inside the canvas slot,
  // mirroring the boot banner. Clears when the adapter mounts.
  if (!gameEl) return;
  await typeLinesInCanvas(gameEl, ["> COMPILING SCRIPT..."], { holdMs: 250 });
}

async function startFromSource(): Promise<boolean> {
  teardownCurrent();
  clearLog();
  statsCursor = 0;
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

  const setup: RoomSetup = runCtl.getState().current;
  setup.actors[0]!.script = heroScript;

  const archLabel = setup.room.archetype ? setup.room.archetype.toUpperCase() : "ROOM";
  pushNotification(`BREACHING ROOM ${runCtl.getState().depth} — ${archLabel}`, {
    style: archLabel === "TRAP" ? "warning" : archLabel === "VAULT" ? "success" : "info",
    duration: 1.5,
  });

  // Brief COMPILING flash inside the canvas slot before the adapter mounts.
  await showCompilingFlash();

  const handle = startRoom(setup, { maxTicks: 5000 });
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
  if (runCtl.getState().phase !== "loadout") return;
  // First parse the script as a fast-fail before transitioning to running.
  try {
    parse(editorEl.value);
  } catch (err) {
    if (err instanceof ParseError) {
      appendLine("— parse error —", "fail");
      for (const line of formatError(editorEl.value, err).split("\n")) appendLine(line, "fail");
      return;
    }
    throw err;
  }
  runCtl.startAttempt();
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
  const heroSnap = currentHandle?.world.actors.find(a => a.isHero);
  if (heroSnap) runCtl.die(currentHandle!.world.tick, heroSnap, "Aborted by player.");
});

btnSkip.style.display = "none";

btnReset.addEventListener("click", () => {
  if (currentHandle) currentHandle.abort();
  // Reset wipes everything (used as a hard escape hatch).
  runCtl.acknowledgeFinal(); // no-op unless in final_review
  clearLog();
});

btnContinue.addEventListener("click", () => {
  // Repurposed: dismisses death recap to TRY AGAIN
  const phase = runCtl.getState().phase;
  if (phase === "death_recap") runCtl.tryAgain();
  else if (phase === "final_review") runCtl.acknowledgeFinal();
});

tabInspector.addEventListener("click", () => {
  if (tabInspector.disabled) return;
  auxOpen = auxOpen === "inspector" ? null : "inspector";
  renderPhase();
});
tabHelp.addEventListener("click", () => {
  if (tabHelp.disabled) return;
  auxOpen = auxOpen === "help" ? null : "help";
  renderPhase();
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

let prevPhase: Phase | null = null;

runCtl.on(renderPhase);

async function maybeAutoStart(): Promise<void> {
  // When the lifecycle moves us into running (e.g. via startAttempt()), we
  // need to compile the editor and mount the adapter.
  if (runCtl.getState().phase !== "running") return;
  if (currentHandle) return;
  const ok = await startFromSource();
  if (!ok) {
    // Parse error — bounce back to loadout for editing.
    return;
  }
  playTimer = setTimeout(playTick, Math.max(tickDelayMs(), SPAWN_HOLD_MS));
}

function renderPhase(): void {
  const s = runCtl.getState();
  const phase = s.phase;

  // Controls enablement.
  btnRun.disabled    = phase !== "loadout";
  btnRun.textContent = "Run";
  btnPause.disabled  = phase !== "running";
  btnStep.disabled   = phase !== "paused";
  btnResume.disabled = phase !== "paused";
  btnStop.disabled   = !(phase === "running" || phase === "paused");
  btnReset.disabled  = false;

  runMetaEl.textContent = `— Depth ${s.depth}, Attempt ${s.attempts}`;

  gamePane.setAttribute("data-phase", phase);
  if (phase === "loadout" || phase === "death_recap" || phase === "final_review" || phase === "quit_confirm") {
    if (currentAdapter) {
      currentAdapter.teardown();
      currentAdapter = null;
    }
    currentHandle = null;
    applyCursor = 0;
    // Re-type "> AWAITING RUN SIGNAL" once the canvas is idle. Idempotent.
    showIdlePrompt(gameEl, bootDone);
  }

  // Inventory pane visible ONLY in loadout (Phase 13.7-style editor + 4-slot
  // loadout picker). Running/paused/recap modes hide it; the canvas HUD takes
  // over during play, and the recap/final modals own the foreground.
  gridEl.classList.toggle("no-inventory", phase !== "loadout");
  if (inventoryCtl) {
    inventoryCtl.setEditable(phase === "loadout");
    inventoryCtl.refresh();
  }

  const hudOn = phase === "running" || phase === "paused";
  heroHud.hidden = !hudOn;
  if (hudOn) updateHud();

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

  // ── Death recap modal (with TRY AGAIN / QUIT) ──
  if (phase === "death_recap" && s.recap) {
    recapTitle.textContent = "PROCESS TERMINATED";
    recapTitle.className = "recap-title-fail";
    recapAttempts.textContent = String(s.recap.attempts);
    recapTurns.textContent = String(s.recap.turns);
    const causeEl = document.getElementById("recap-cause");
    if (causeEl) causeEl.textContent = s.recap.cause ?? "";
    const ctaEl = document.getElementById("recap-cta");
    if (ctaEl) ctaEl.textContent = "Edit script and try again, or end the run.";
    btnContinue.textContent = "TRY AGAIN";
    ensureQuitButton(recapModal, () => runCtl.requestQuit());
    recapModal.hidden = false;
  } else if (phase === "quit_confirm") {
    showQuitConfirm(() => runCtl.confirmQuit(), () => runCtl.cancelQuit());
    recapModal.hidden = true;
  } else if (phase === "final_review") {
    showFinalReview(s.finalSnapshot ?? s.run, () => runCtl.acknowledgeFinal());
    recapModal.hidden = true;
  } else {
    recapModal.hidden = true;
    hideQuitConfirm();
    hideFinalReview();
  }

  if (phase !== "paused") {
    renderInspectorEmpty(
      inspectorEl,
      phase === "loadout"  ? "Pre-attempt." :
      phase === "death_recap"  ? "Run ended." :
      /* running */        "Running…"
    );
  }

  // Auto-start when the controller transitioned into running.
  if (phase === "running" && prevPhase !== "running" && prevPhase !== "paused") {
    void maybeAutoStart();
  }
  prevPhase = phase;
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

function setActiveGutterLine(line: number | null): void {
  activeGutterLine = line;
  renderGutter();
}

editorEl.addEventListener("input", renderGutter);
editorEl.addEventListener("scroll", () => { gutterEl.scrollTop = editorEl.scrollTop; });
renderGutter();

// Initial state.
inventoryCtl = mountInventoryPanel(
  inventoryEl,
  () => runCtl.getState().current.actors[0] ?? null,
  () => {
    if (runCtl.getState().phase !== "loadout") return null;
    return {
      getSelection: () => runCtl.getState().loadout,
      getDepotCounts: () => {
        const inst = depotConsumableInstances(runCtl.getState().run);
        const counts = new Map<string, number>();
        for (const [defId, list] of inst) counts.set(defId, list.length);
        return counts;
      },
      setSlot: (idx, defId) => runCtl.setLoadoutSlot(idx, defId),
    };
  },
);

const helpEl = document.getElementById("help") as HTMLDivElement;
const helpPane = mountHelpPane(helpEl, {
  isSpellVisible: (name: string) => {
    const hero = (currentHandle?.world.actors.find(a => a.isHero))
      ?? runCtl.getState().current.actors[0];
    return !!hero?.knownSpells?.includes(name);
  },
});
speedOut.textContent = `${tickDelayMs()}ms`;

// Boot banner before the first renderPhase so its .boot-screen occupies
// #game-view. renderPhase's showIdlePrompt is suppressed while boot is in
// progress; once boot finishes, we flip the gate and append the AWAITING
// line below the boot transcript.
const bootPromise = showBootBanner(gameEl);
renderPhase();
bootPromise.then(() => { bootDone = true; showIdlePrompt(gameEl, bootDone); });
