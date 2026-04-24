// Help system types. The help tree is a 3-level browse:
//   category  → list of entries  → leaf.
// Entries come from two sources: hand-authored registries (Commands, Queries,
// Events, Data, Language, Examples) and generated catalogs that read the
// engine's content registries (Spells, Items, Monsters). Every entry is
// flattened into a single HelpEntry map keyed by `path` (e.g., "commands/cast").
//
// The `help?` field on a Spell / ItemDef / MonsterTemplate is OPTIONAL — when
// absent the generated loader derives a minimal entry from the registry's
// other fields. Required fields on the registries stay required; this type
// is additive.

export type CategoryId =
  | "language"
  | "data"
  | "commands"
  | "queries"
  | "spells"
  | "items"
  | "monsters"
  | "events"
  | "examples";

export interface HelpExample {
  /** Exact, paste-ready DSL. Must parse cleanly via src/lang/parse(). */
  code: string;
  /** Optional one-liner shown above the snippet. */
  caption?: string;
}

/** Author-supplied help metadata, attachable to Spells, Items, Monsters. */
export interface HelpMeta {
  blurb?: string;
  examples?: HelpExample[];
  related?: string[];
}

export interface HelpEntry {
  /** Last path segment — stable id within its category. */
  id: string;
  /** "<category>/<id>". Unique across the whole tree. */
  path: string;
  category: CategoryId;
  name: string;
  /** One-line description. Shown in list rows and search results. */
  blurb: string;
  /** Optional signature line (commands/queries): `cast(name, target?)`. */
  signature?: string;
  /** Optional longer prose body. Minimal markdown: `#` headings + paragraphs + `\`\`\`` blocks. */
  body?: string;
  /** Paste-ready snippets. May be empty for some entries. */
  examples: HelpExample[];
  /** Paths to related leaves (clickable cross-links). */
  related: string[];
  /** Optional key/value detail shown as a definition table. */
  meta?: Array<[string, string]>;
}

export interface HelpCategory {
  id: CategoryId;
  title: string;
  blurb: string;
}

export const CATEGORIES: readonly HelpCategory[] = [
  { id: "language",  title: "Language", blurb: "DSL syntax: blocks, control flow, expressions." },
  { id: "data",      title: "Data",     blurb: "Shapes returned by queries: Actor, Door, Item, FloorItem, Cloud." },
  { id: "commands",  title: "Commands", blurb: "Actions the hero can take (cost energy)." },
  { id: "queries",   title: "Queries",  blurb: "Zero-cost lookups into the world." },
  { id: "spells",    title: "Spells",   blurb: "Every spell in the registry with range, cost, target." },
  { id: "items",     title: "Items",    blurb: "Consumables and wearables." },
  { id: "monsters",  title: "Monsters", blurb: "Templates spawned in rooms." },
  { id: "events",    title: "Events",   blurb: "Hooks your handlers can listen for." },
  { id: "examples",  title: "Examples", blurb: "Full annotated scripts." },
];
