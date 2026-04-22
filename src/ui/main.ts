// UI wiring for the minimal shell. Run button executes the hardcoded demo
// AST through the engine; the event log is streamed into the right panel.

import { runRoom, type EngineHandle } from "../engine.js";
import { formatLogEntry } from "../scheduler.js";
import { demoSetup } from "../demo.js";

const btnRun = document.getElementById("btn-run") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const logEl = document.getElementById("event-log") as HTMLUListElement;

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
  appendLine("— run —");
  const handle = runRoom(demoSetup(), { maxTicks: 2000 });
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
