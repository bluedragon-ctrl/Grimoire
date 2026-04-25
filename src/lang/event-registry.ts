// Registry of valid event names for `on <event>:` handlers.
//
// Authoritative list — keep in sync with scheduler's mapEventToHandler.
// The parser uses isValidEventName() to reject misspelled handlers at parse
// time so a typo like `on hti:` doesn't silently never fire.

export const EVENT_NAMES = ["hit", "see"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

const eventSet: ReadonlySet<string> = new Set(EVENT_NAMES);

export function isValidEventName(name: string): name is EventName {
  return eventSet.has(name);
}
