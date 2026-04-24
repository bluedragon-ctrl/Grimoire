# Help system

The in-game Help pane (Prep screen, right tab) is a 3-level browser:

```
HELP ▸ <Category> ▸ <Entry>
```

Content comes from two sources:

| Source | Files |
|---|---|
| Hand-authored registries | `src/ui/help/commands.ts`, `queries.ts`, `data.ts`, `events.ts`, `examples.ts`, `pages/language.md` |
| Auto-generated from engine registries | `src/ui/help/catalogs.ts` reads `SPELLS`, `ITEMS`, `MONSTER_TEMPLATES` |

## Adding a spell / item / monster

Add the registry entry as usual. The Help pane picks it up automatically — the generator derives a blurb from the def's existing fields (description, stats, etc.) and ships a default paste-ready snippet.

To override the auto-generated copy, attach an optional `help?: HelpMeta` to the def:

```ts
frostbolt: {
  name: "frostbolt", description: "…",
  targetType: "enemy", range: 6, mpCost: 8,
  body: [ … ],
  help: {
    blurb: "Chilling bolt that slows on hit.",
    examples: [
      { caption: "Open with frost.", code: "cast(\"frostbolt\", enemies()[0])" },
    ],
    related: ["spells/chill", "commands/cast"],
  },
},
```

`HelpMeta` is defined in `src/ui/help/types.ts`. Every field is optional — missing fields fall back to the generator's defaults. Required registry fields (name, stats, etc.) stay required; `help?` is additive.

## Adding a command or query

Edit the corresponding hand-authored registry:

- Command: `src/ui/help/commands.ts` → `COMMAND_HELP`
- Query: `src/ui/help/queries.ts` → `QUERY_HELP`

The key must match the command/query name exactly — the coverage test will fire if you miss one.

## Snippet guarantee

Every example snippet in every leaf is parsed via `src/lang/parse()` by `tests/ui/help/examples.test.ts`. If a DSL change breaks an example, the test fails — rewrite the snippet. Execution is intentionally out of scope: snippets reference live game state (e.g., `enemies()[0]`) that a test world doesn't always have.

## Boundary

`src/ui/help/` imports from content registries read-only. It does not import from other `src/ui/` siblings (beyond the mount point in `main.ts`) and does not touch `World`, the scheduler, or any engine mutation path. Help data is computed once per session and cached.
