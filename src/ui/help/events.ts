// Event handler reference. The set comes from src/lang/event-registry.ts —
// the parser rejects `on <other>` at parse time, so this catalogue is the
// complete list of names you can put after `on`.

import type { HelpEntry } from "./types.js";

type EventPage = Omit<HelpEntry, "category" | "path"> & {
  examples: HelpEntry["examples"];
  related: string[];
};

export const EVENT_PAGES: Record<string, EventPage> = {
  registry: {
    id: "registry", name: "Event registry",
    blurb: "Every name you can use after `on`. The parser rejects anything else with a hint.",
    body: "Handlers sit alongside the main body and fire on engine events for the actor that owns the script. The valid event names are fixed — adding a new one requires touching `src/lang/event-registry.ts` and the scheduler. Today the list is:\n\n- `hit` — your owner was just struck. Binding: the attacker Actor.\n- `see` — your owner first noticed something. Binding: a description of what was seen.\n\nA misspelled handler name (`on hti:`) is a parse error with a did-you-mean hint, not a silent never-fires.\n\nHandlers keep firing even after the main body has halted — a halted caster can still retaliate via `on hit`.",
    examples: [{ caption: "Both handlers, side by side.", code: "on hit as attacker:\n  flee(attacker)\n\non see as what:\n  cast(\"shield\")" }],
    related: ["events/hit", "events/see"],
  },
  hit: {
    id: "hit", name: "on hit",
    blurb: "Fires when the owner actor is struck. Binding: the attacker Actor.",
    body: "Handler shape:\n\n```\non hit as attacker:\n  # attacker is the Actor who hit me\n  flee(attacker)\n```\n\nHandlers run after the main body, and they keep firing even after the main body halts — a halted cultist still flees whoever jumped it.",
    examples: [{ caption: "Retaliate on every hit.", code: "on hit as attacker:\n  attack(attacker)" }],
    related: ["events/registry", "events/see", "commands/attack", "data/actor"],
  },
  see: {
    id: "see", name: "on see",
    blurb: "Fires when the owner actor first sees something. Binding: a description of what was seen.",
    body: "Handler shape:\n\n```\non see as what:\n  cast(\"shield\")\n```\n\n`what` describes the sighted entity. Like `on hit`, see-handlers continue firing even after the main body halts.",
    examples: [{ caption: "Cast a shield when you see anything.", code: "on see as what:\n  cast(\"shield\")" }],
    related: ["events/registry", "events/hit"],
  },
  script_error: {
    id: "script_error", name: "ScriptError (log event)",
    blurb: "Emitted to the event log when a script throws at runtime.",
    body: "Not a handler-target — you can't `on script_error:`. It surfaces in the event log so a designer can see that e.g. a type coercion failed. Phase 11.6 stopped swallowing these; if your script touches something invalid, expect a visible failure rather than a silent nop.",
    examples: [],
    related: ["events/registry"],
  },
};
