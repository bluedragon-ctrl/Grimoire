// UI wiring. Run parses the textarea as a Grimoire script and swaps the
// resulting Script into the demo's hero before launching the engine.
// Parse errors render into the event-log panel with a caret and hint.

import { runRoom, type EngineHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import { demoSetup } from "../demo.js";
import { parse, ParseError, formatError } from "../lang/index.js";

const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const logEl = document.getElementById("event-log") as HTMLUListElement;
const editorEl = document.getElementById("editor") as HTMLTextAreaElement;

const DEFAULT_SCRIPT = [
  "# Hero script — edit and click Run.",
  "while enemies().length > 0:",
  "  approach(enemies()[0])",
  "  attack(enemies()[0])",
  "",
  "while me.pos.x != doors()[0].pos.x or me.pos.y != doors()[0].pos.y:",
  "  approach(doors()[0])",
  "",
  "exit(\"N\")",
  "halt",
  "",
].join("\n");

editorEl.readOnly = false;
editorEl.placeholder = "# Your script here";
if (editorEl.value.trim() === "") editorEl.value = DEFAULT_SCRIPT;

let current: EngineHandle | null = null;

function appendLine(text: string, cls?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog(): void { logEl.innerHTML = ""; }

btnRun.addEventListener("click", () => {
  clearLog();
  const source = editorEl.value;
  let heroScript;
  try {
    heroScript = parse(source);
  } catch (err) {
    if (err instanceof ParseError) {
      appendLine("— parse error —", "fail");
      for (const line of formatError(source, err).split("\n")) {
        appendLine(line, "fail");
      }
      return;
    }
    throw err;
  }

  appendLine("— run —");
  const setup = demoSetup();
  setup.actors[0]!.script = heroScript;
  const handle = runRoom(setup, { maxTicks: 2000 });
  current = handle;
  for (const entry of handle.log) {
    const line = formatLogEntry(entry);
    appendLine(line, entry.event.type === "ActionFailed" ? "fail" : undefined);
  }
  appendLine(`— done (tick=${handle.world.tick}) —`);
});

btnStop.addEventListener("click", () => {
  if (!current) return;
  current.abort();
  appendLine("— stop —");
});
