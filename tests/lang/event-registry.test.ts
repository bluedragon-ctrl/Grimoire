// Parse-time validation of `on <event>:` handler names.

import { describe, it, expect } from "vitest";
import { parse } from "../../src/lang/parser.js";
import { EVENT_NAMES, isValidEventName } from "../../src/lang/event-registry.js";

describe("event registry", () => {
  it("EVENT_NAMES contains the canonical events", () => {
    // Sanity: scheduler dispatches at least these.
    expect(EVENT_NAMES).toContain("hit");
    expect(EVENT_NAMES).toContain("see");
  });

  it("isValidEventName accepts registered names", () => {
    for (const name of EVENT_NAMES) {
      expect(isValidEventName(name)).toBe(true);
    }
  });

  it("isValidEventName rejects unknown names", () => {
    expect(isValidEventName("hti")).toBe(false);
    expect(isValidEventName("died")).toBe(false);
    expect(isValidEventName("")).toBe(false);
  });
});

describe("parser — `on <event>:` validation", () => {
  it("accepts `on hit:` handler", () => {
    expect(() => parse(`
on hit:
  wait()
halt
`)).not.toThrow();
  });

  it("accepts `on see:` handler", () => {
    expect(() => parse(`
on see:
  wait()
halt
`)).not.toThrow();
  });

  it("rejects an unknown event name", () => {
    expect(() => parse(`
on died:
  wait()
halt
`)).toThrow();
  });

  it("rejects a typo and (ideally) suggests the closest known name", () => {
    let err: Error | null = null;
    try {
      parse(`
on hti:
  wait()
halt
`);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    // Did-you-mean should mention "hit" — the closest valid name.
    expect(err!.message.toLowerCase()).toContain("hit");
  });
});
