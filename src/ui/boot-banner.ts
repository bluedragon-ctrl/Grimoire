// Boot banner + idle prompt rendered inside the empty #game-view slot.
// Both share a typewriter primitive that streams characters into a host
// element. Boot fires once per session; the idle prompt re-types whenever
// the canvas returns to a non-running phase (loadout / death_recap / etc.).

import { visualConfig } from "../config/visuals.js";

export interface TypeLinesOpts {
  charMs?: number;
  lineGapMs?: number;
  holdMs?: number;
  clearOnDone?: boolean;
}

// Render terminal-style lines char-by-char into `host`. Resolves after the
// final hold completes. Reuses any existing `.boot-screen` so successive
// calls append rather than wipe.
export function typeLinesInCanvas(
  host: HTMLElement,
  lines: string[],
  opts: TypeLinesOpts = {},
): Promise<void> {
  const { charMs = 35, lineGapMs = 220, holdMs = 600, clearOnDone = true } = opts;
  return new Promise(resolve => {
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
        if (!screen!.isConnected) return;
        const li = document.createElement("div");
        li.className = "boot-line typing";
        const txt = document.createElement("span");
        txt.className = "boot-text";
        const cur = document.createElement("span");
        cur.className = "boot-cursor";
        cur.textContent = "_";
        li.appendChild(txt);
        li.appendChild(cur);
        const prev = screen!.querySelector(".boot-line.typing");
        if (prev) prev.classList.remove("typing");
        screen!.appendChild(li);
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
      if (clearOnDone && screen!.isConnected) screen!.remove();
      resolve();
    }, cursorTime + holdMs);
  });
}

let bootBannerShown = false;

// Plays the GRIMOIRE boot banner once per session (gated by visualConfig).
// No-op if the canvas already has content.
export function showBootBanner(host: HTMLElement | null): Promise<void> {
  const cfg = visualConfig.bootBanner;
  if (!cfg.enabled) return Promise.resolve();
  if (cfg.firstRunOnlyPerSession && bootBannerShown) return Promise.resolve();
  bootBannerShown = true;
  if (!host || host.children.length > 0) return Promise.resolve();

  const version = "0.15";
  const middle = cfg.middleLines[Math.floor(Math.random() * cfg.middleLines.length)] ?? "LOADING...";
  return typeLinesInCanvas(host, [
    `> GRIMOIRE v${version}`,
    `> COMPILING SCRIPT...`,
    `> ${middle}`,
    `> RUN`,
  ], { holdMs: 300, clearOnDone: false });
}

const IDLE_LINE = "> AWAITING RUN SIGNAL";

// Re-types the idle prompt once the canvas is empty (or only holds the boot
// transcript). Idempotent — skipped if the line is already present, or if
// the boot banner is still in progress (`bootDone === false`).
export function showIdlePrompt(host: HTMLElement | null, bootDone: boolean): void {
  if (!host) return;
  if (!bootDone) return;
  const onlyChild = host.children[0];
  if (onlyChild && !onlyChild.classList.contains("boot-screen")) return;
  const existing = Array.from(host.querySelectorAll(".boot-line .boot-text"))
    .some(el => el.textContent === IDLE_LINE);
  if (existing) return;
  void typeLinesInCanvas(host, [IDLE_LINE], { holdMs: 0, clearOnDone: false });
}
