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
    related: ["events/see", "commands/attack", "data/actor"],
  },
  see: {
    id: "see", name: "on see",
    blurb: "Fires when the owner actor first sees something. Binding: a description of what was seen.",
    body: "Handler shape:\n\n```\non see as what:\n  # what describes the sighted entity\n```\n\nLike `on hit`, see-handlers continue firing even after the main body halts.",
    examples: [{ caption: "Yell when you see the hero.", code: "on see as what:\n  attack(hero())" }],
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
