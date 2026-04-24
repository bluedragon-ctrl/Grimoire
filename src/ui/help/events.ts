// Event handler reference. The set is small and stable — these are the
// events that `on <name> as <binding>:` handlers are wired for.

import type { HelpEntry } from "./types.js";

type EventPage = Omit<HelpEntry, "category" | "path"> & {
  examples: HelpEntry["examples"];
  related: string[];
};

export const EVENT_PAGES: Record<string, EventPage> = {
  hit: {
    id: "hit", name: "on hit",
    blurb: "Fires when the owner actor is struck. Binding: the attacker Actor.",
    body: "Handler shape:\n\n```\non hit as attacker:\n  # attacker is the Actor who hit me\n  flee(attacker)\n```\n\nHandlers run after the main body, and they keep firing even after the main body halts — a halted cultist still flees whoever jumped it.",
    examples: [{ caption: "Retaliate on every hit.", code: "on hit as attacker:\n  attack(attacker)" }],
    related: ["events/died", "commands/attack", "data/actor"],
  },
  died: {
    id: "died", name: "on died",
    blurb: "Fires once when the owner actor dies.",
    body: "The handler runs after the fatal damage is applied. The actor is no longer `alive` when this body executes, so most commands will fail — use it for event log / bookkeeping intents only.",
    examples: [{ caption: "Trigger a parting shot (costs energy but runs once).", code: "on died:\n  halt" }],
    related: ["events/hit"],
  },
  script_error: {
    id: "script_error", name: "ScriptError (log event)",
    blurb: "Emitted to the event log when a script throws at runtime.",
    body: "Not a handler-target — you can't `on script_error:`. It surfaces in the event log so a designer can see that e.g. a type coercion failed. Phase 11.6 stopped swallowing these; if your script touches something invalid, expect a visible failure rather than a silent nop.",
    examples: [],
    related: [],
  },
};
