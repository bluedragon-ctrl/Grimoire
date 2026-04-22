// Cloud definitions — persistent area effects that linger on tiles for N turns
// and apply DSL scripts (onTick/onEnter) to any entity standing in them.
//
// ── Fields ────────────────────────────────────────────────
//   name, description      display strings
//   damageType             damage type used by harm/DoT calls within the
//                          cloud's onTick/onEnter scripts. The script is
//                          expected to pass this type explicitly — this field
//                          is the source of truth for `help clouds` and for
//                          future tooling that categorizes clouds.
//   blocksSight            if true, tiles occupied by this cloud block FOV
//   blocksMove             if true, tiles occupied by this cloud block movement
//   colors                 { color, color2? } hex pair for the renderer
//   render                 effect-renderer key in js/ui/render-effects.js
//                          (tileCloud-kind draw function)
//   onTick                 DSL string run once per entity standing in the cloud
//                          at turn tick. Bindings: $ENTITY, $POWER, $SOURCE.
//   onEnter                DSL string run once when an entity first steps onto
//                          a cloud tile. Same bindings as onTick.
//   friendlyFire           default true. If false, the cloud's source entity
//                          is excluded from onTick/onEnter application.
//
// ── Reserved extension points (not implemented this phase) ─
//   drift: { dx, dy }      per-turn cloud displacement (smoke rises, poison sinks).
//   interactions: {...}    pairwise cloud reactions (fire+poison → explosion,
//                          water+fire → steam). Table shape tbd.
//   shapes: cone/ring/etc  only 'circle' and 'line' are spawned currently.

export const CLOUD_DEFS = {
  poison: {
    name: 'poison cloud',
    description: 'Toxic gas. Poisons anything that breathes it.',
    damageType: 'poison',
    blocksSight: false,
    blocksMove: false,
    colors: { color: '#88cc66', color2: '#66aa44' },
    render: 'cloudWavy',
    onTick: 'inflict poison $ENTITY 2 $POWER',
    //   Note: $ENTITY is the affected entity's id (bound by the cloud engine),
    //   $POWER = cloud.power. `self` inside the script = the affected entity.
    //   The burst damage ticks via the `poison` status (see statuses.js) which
    //   carries the `poison` type — nothing to pass here.
    onEnter: null,
    friendlyFire: true,
  },
  fire: {
    name: 'fire',
    description: 'Burning tile. Damages and ignites.',
    damageType: 'fire',
    blocksSight: false,
    blocksMove: false,
    colors: { color: '#ff6622', color2: '#ffaa44' },
    render: 'cloudWavy',
    onTick: 'harm hp 3 fire; inflict burn $ENTITY 2 $POWER',
    onEnter: null,
    friendlyFire: true,
  },
  smoke: {
    name: 'smoke',
    description: 'Thick smoke. Blocks sight.',
    damageType: null,   // non-damaging
    blocksSight: true,
    blocksMove: false,
    colors: { color: '#666666', color2: '#333333' },
    render: 'cloudWavy',
    onTick: null,
    onEnter: null,
    friendlyFire: true,
  },
  frost: {
    name: 'frost cloud',
    description: 'Freezing mist. Chills and damages anything within.',
    damageType: 'frost',
    blocksSight: false,
    blocksMove: false,
    colors: { color: '#66ccff', color2: '#aaddff' },
    render: 'cloudWavy',
    onTick: 'harm hp 2 frost; inflict chill $ENTITY 3 $POWER',
    onEnter: null,
    friendlyFire: true,
  },
  lightning: {
    name: 'storm',
    description: 'Charged air. Shocks anything that lingers.',
    damageType: 'lightning',
    blocksSight: false,
    blocksMove: false,
    colors: { color: '#ffee44', color2: '#ffffaa' },
    render: 'cloudWavy',
    onTick: 'harm hp 3 lightning; inflict shock $ENTITY 2 $POWER',
    onEnter: null,
    friendlyFire: true,
  },
};

// Reserved — cloud-cloud interactions table. Example future shape:
//   [['fire', 'poison'], { spawn: 'explosion', removeSources: true }]
// Not consulted anywhere yet.
export const CLOUD_INTERACTIONS = [];
