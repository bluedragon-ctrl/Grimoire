// Visual configuration — toggles, message pools, boot banner content.
// Consumed by the UI layer (boot banner, notify overlay, death sequence).
// Kept separate so individual settings can be tuned without touching logic.

export const visualConfig = {
  bootBanner: {
    enabled: true,
    /** Show once per browser session (in-memory flag). false = always show. */
    firstRunOnlyPerSession: true,
    middleLines: [
      "BINDING HERO...",
      "ALLOCATING MANA...",
      "LOADING SCRIPT...",
      "VERIFYING CHECKSUM...",
    ],
  },
  projectileTrails: { enabled: true },
  faultMessages: [
    "SCRIPT FAULT",
    "NULL DEREFERENCE",
    "STACK CORRUPTED",
    "SEGFAULT",
    "KERNEL PANIC",
  ],
} as const;
