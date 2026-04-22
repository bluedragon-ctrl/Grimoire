// Visual presets — named render configs for spell primitives.
//
// A preset bundles the render layer's visual params (projectile kind, burst
// kind, colors, radius) under a short, player-facing name. Scripts reference
// presets by name via the `visual=` flag on primitives (`project`, `explode`,
// `spawn-cloud`):
//
//   project $TARGET element=fire damage=8 visual=bolt_orange
//   explode $TARGET element=fire radius=3 visual=burst_ember
//   spawn-cloud $TARGET kind=poison visual=cloud_green
//
// Design:
//   - Presets are pure data. Renderers consume them unchanged.
//   - Omitting `visual=` falls back to ELEMENT_DEFAULTS below.
//   - Players will unlock additional presets as loot (later phase).
//
// See PRIMITIVES.md for the full primitive spec.

// ── Projectile presets (for `project`) ────────────────────────
// Shape: { projectile: <kind>, colors: { color, color2 } }
export const PROJECTILE_PRESETS = Object.freeze({
  bolt_orange:   { projectile: 'bolt',   colors: { color: '#ff6622', color2: '#ffdd66' } },
  bolt_red:      { projectile: 'bolt',   colors: { color: '#ff2200', color2: '#ff8800' } },
  bolt_blue:     { projectile: 'bolt',   colors: { color: '#66ddff', color2: '#ffffff' } },
  bolt_green:    { projectile: 'bolt',   colors: { color: '#44bb44', color2: '#aaee66' } },
  beam_arcane:   { projectile: 'beam',   colors: { color: '#cc88ff', color2: '#ffffff' } },
  beam_frost:    { projectile: 'beam',   colors: { color: '#44aadd', color2: '#cceeff' } },
  beam_drain:    { projectile: 'beam',   colors: { color: '#884422', color2: '#ff6666' } },
  zigzag_yellow: { projectile: 'zigzag', colors: { color: '#ffee44', color2: '#ffffff' } },
  zigzag_white:  { projectile: 'zigzag', colors: { color: '#ffffff', color2: '#ffee44' } },
  orbs_violet:   { projectile: 'orbs',   colors: { color: '#aa66ff', color2: '#ddaaff' } },
  orbs_green:    { projectile: 'orbs',   colors: { color: '#44ff88', color2: '#aaffcc' } },
  arrow_wood:    { projectile: 'arrow',  colors: { color: '#ccbb99', color2: '#886644' } },
  thrown_stone:  { projectile: 'thrown', colors: { color: '#888888', color2: '#aaaaaa' } },
  thrown_smoke:  { projectile: 'thrown', colors: { color: '#888888', color2: '#666666' } },
});

// ── Burst presets (for `explode`) ─────────────────────────────
// Shape: { burst: <kind>, colors: { color, color2 } }
export const BURST_PRESETS = Object.freeze({
  burst_ember:   { burst: 'explosion',     colors: { color: '#ff6622', color2: '#ffcc66' } },
  burst_frost:   { burst: 'explosion',     colors: { color: '#66ccff', color2: '#ffffff' } },
  burst_shock:   { burst: 'explosion',     colors: { color: '#ffff66', color2: '#aaddff' } },
  burst_arcane:  { burst: 'blobExplosion', colors: { color: '#aa66ff', color2: '#ccaaff' } },
  burst_acid:    { burst: 'blobExplosion', colors: { color: '#88cc44', color2: '#ccee88' } },
});

// ── Cloud presets (for `spawn-cloud`) ─────────────────────────
// Shape: { colors: { color, color2 } } — cloud kind drives its own tile draw;
// colors tint the spawn burst and any per-tick sparkle.
export const CLOUD_PRESETS = Object.freeze({
  cloud_green:   { colors: { color: '#55aa33', color2: '#88cc55' } },
  cloud_fire:    { colors: { color: '#ff6622', color2: '#ffaa44' } },
  cloud_frost:   { colors: { color: '#66ccff', color2: '#aaddff' } },
  cloud_shock:   { colors: { color: '#ffee44', color2: '#aaffee' } },
  cloud_smoke:   { colors: { color: '#888888', color2: '#666666' } },
});

// ── Element → default preset mapping ──────────────────────────
// Used when a primitive omits `visual=`. Keeps minimal scripts readable:
//   project $TARGET element=fire damage=8
// picks `bolt_orange` automatically.
export const ELEMENT_DEFAULTS = Object.freeze({
  project: {
    fire:      'bolt_orange',
    frost:     'bolt_blue',
    lightning: 'zigzag_yellow',
    arcane:    'orbs_violet',
    poison:    'bolt_green',
    physical:  'arrow_wood',
  },
  explode: {
    fire:      'burst_ember',
    frost:     'burst_frost',
    lightning: 'burst_shock',
    arcane:    'burst_arcane',
    poison:    'burst_acid',
    physical:  'burst_ember',
  },
  'spawn-cloud': {
    fire:      'cloud_fire',
    frost:     'cloud_frost',
    lightning: 'cloud_shock',
    poison:    'cloud_green',
    smoke:     'cloud_smoke',
  },
});

// Resolve a visual name to its preset object. Verb is one of
// 'project' / 'explode' / 'spawn-cloud'. Returns undefined if the name
// is unknown — caller should fall back to the element default.
export function resolveVisual(verb, name) {
  if (!name) return undefined;
  if (verb === 'project')     return PROJECTILE_PRESETS[name];
  if (verb === 'explode')     return BURST_PRESETS[name];
  if (verb === 'spawn-cloud') return CLOUD_PRESETS[name];
  return undefined;
}

// Resolve the default preset for a verb + element (or cloud kind).
export function defaultVisual(verb, element) {
  const table = ELEMENT_DEFAULTS[verb];
  if (!table) return undefined;
  return resolveVisual(verb, table[element]);
}
