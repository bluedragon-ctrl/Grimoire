# Phase 13.6 — Help system coverage gap report

Inventory of stale references and missing coverage in the help system, taken
against the post-13.5 DSL surface. Each row is something to fix, add, or
rewrite in this phase.

## DSL surface (authoritative)

**Commands** (yield PendingAction): `approach`, `flee`, `attack`, `cast`,
`use`, `pickup`, `drop`, `summon`, `wait`, `exit`, `halt`.

**Queries** (zero-cost callables in `commands.ts`): `me`, `hp`, `mp`,
`max_mp`, `known_spells`, `enemies`, `allies`, `items`, `chests`, `doors`,
`items_here`, `items_nearby`, `clouds`, `cloud_at`, `at`, `chance`,
`random`.

**Builtins** (interpreter): `len`, `min`, `max`.

**Actor surface** (snake_case alias / bound method, see
`src/lang/actor-surface.ts`):
- properties: `is_hero`, `is_summoned`, `summoner`
- methods: `distance_to`, `adjacent_to`, `has_effect`, `effect_remaining`,
  `effect_magnitude`, `list_effects`, `can_cast`, `in_los`
- camelCase fall-through: `id`, `kind`, `hp`, `maxHp`, `mp`, `maxMp`,
  `atk`, `def`, `int`, `pos`, `alive`, `faction`, `owner`, `summoned`,
  `knownSpells`, `effects`, `inventory`.

**Collection surface** (post-13.5; `src/lang/collection.ts`):
- properties: `length`
- methods: `filter(pred)`, `sorted_by(key)`, `first()`, `last()`,
  `min_by(key)`, `max_by(key)`
- semantics: indexing (`xs[0]`), iteration (`for x in xs:`), Pythonic
  truthiness (empty is falsy), `len(xs)`.

**Control flow / definitions**: `if`/`elif`/`else`, `while`, `for`/`in`,
`break`, `continue`, `pass`, `def`, `return`, `lambda`.

**Event registry** (`src/lang/event-registry.ts`): `hit`, `see`. Parser
rejects any other event name with `did-you-mean` hint.

## Stale references found

| Path | Stale snippet | Replacement |
|---|---|---|
| `queries/me` body | `distance(me, foo)`, `has_effect(me, ...)` standalones | `me.distance_to(foo)`, `me.has_effect(...)` |
| `queries/me` example | `has_effect(me, "burning")` | `me.has_effect("burning")` |
| `queries/allies` example | `can_cast("heal", ...)` standalone | `me.can_cast("heal", ...)` |
| `commands/cast` body / example | references `can_cast` standalone | `me.can_cast` |
| `commands/cast` body | "see `known_spells()`" — fine | (unchanged) |
| `commands/wait` example | `has_effect(enemies()[0], "burning")` | `enemies()[0].has_effect("burning")` |
| `language.md` if/elif example | `adjacent(me, enemies()[0])` | `me.adjacent_to(enemies()[0])` |
| `language.md` Comparisons example | `has_effect(me, "regen")` | `me.has_effect("regen")` |
| `language.md` Function definitions | uses `func` keyword | `def` (the actual keyword) |
| `language.md` `enemies().length` | works but inconsistent with `len(...)` style | switch to `len(enemies())` |
| `catalogs.ts` autoSpellExample | `can_cast("...", target)` standalone | `me.can_cast("...", target)` |
| `examples/cast_or_approach` body | mentions `can_cast("bolt", target)` standalone in prose | rewrite prose to use method form |

Removed-in-13.5 standalones that **must not** appear anywhere: `distance`,
`adjacent`, `has_effect`, `can_cast`, `effects`. The parser still has them
in `KNOWN_NAMES` only for did-you-mean hints — they are not callable.

## Missing coverage (13.5 additions)

- **Collection page** — `data/collection`. Methods, indexing, iteration,
  truthiness, `len`. No entry today.
- **Dot-walk on actors** — `data/actor` exists but is light on examples
  for chained method use (`me.has_effect(...)`, `foe.distance_to(me)`,
  `target.can_cast(...)`).
- **Lambdas** — no entry. Needed alongside Collection (`.filter`,
  `.min_by` signatures).
- **`def`** — `language.md` mentions function definitions but uses the
  wrong keyword (`func`). No coverage of recursion or scope.
- **`break` / `continue` / `pass`** — none are documented.
- **Builtins `len`, `min`, `max`** — not documented as queries; they
  aren't queries (they're interpreter builtins). Need to live somewhere
  the user can find them.
- **AoE shape page** — `data/aoe`. The Chebyshev vs Euclidean split
  introduced in 13.5 (adjacency = square, AoE = round) deserves a
  visible page so designers know which is which.
- **Failure handling page** — command return values: `cast()` returns
  `False` on out-of-range etc., and the in-expression bool can drive a
  branch. Not covered today.
- **Events page completeness** — `events/script_error` is listed but
  isn't a handler. The actual handler-target set (`hit`, `see`) is the
  whole registry; the page should make that explicit and link back to
  `event-registry.ts` for the source of truth.

## Voice / readability

`language.md` is the most engine-jargon-heavy page. Specific issues:

- "Mixing tabs and spaces within the same block is a parse error" —
  reframe as "the game can't read your script if you mix them".
- "A `halt` inside does NOT break — it ends the main body entirely" —
  technically correct but uses load-bearing capitalization the kid
  audience won't parse.
- "Numbers are 64-bit floats; most engine APIs expect integers and
  floor internally" — pure implementation detail.
- "Bare names in the main body are locals" — "Bare names" is
  programmer-speak.

## Cross-reference gaps

After the 13.5 additions:
- `data/actor` should link to `data/collection`, `language/lambdas`,
  `language/dotwalk`.
- `commands/cast` should link to a `data/failure` page, not just to the
  cast spell.
- `data/aoe` (new) should link to every AoE-relevant spell
  (`spells/fireball`, `spells/frost_nova`, `spells/thunderclap`,
  `spells/meteor`).
- Every effect-applying spell should link to the corresponding effect
  page — but there are no effect pages today. Out of scope (would need
  a new category); flagged here for a future phase.

## Out of scope (this phase)

- Adding new help categories (would require touching `CategoryId` union
  and the 3-level browse). New entries land in existing categories.
- Per-effect pages.
- UI redesign of help-pane.

## How this gets fixed (suggested commit slicing — see phase prompt)

1. This document.
2. Stale-API removal (search/replace + spot rewrites).
3. New entries: `data/collection`, `data/aoe`, `data/failure`, plus
   sections appended to `language.md` for `def`/`lambda`/`break`/
   `continue`/`pass` and the builtins.
4. Body-code-fence parser test (catches stale code inside `body` text,
   not only `examples[]`).
5. Execute-validation for short, self-contained snippets.
6. Voice rewrite of `language.md`.
7. Related-link audit + fixes.
8. DSL-surface coverage assertion test.
