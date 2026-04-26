// Core types: AST, world/entities, events, pending actions.

// ──────────────────────────── Source positions ────────────────────────────

// Optional on every AST node so the parser can attach source locations for
// editor integration (Phase 4 gutter highlight). Hand-written ASTs (tests,
// demo, ast-helpers) simply omit it — consumers must treat as optional.
export interface SourcePos { line: number; col: number; }
export interface SourceLoc { start: SourcePos; end: SourcePos; }

// ──────────────────────────── AST ────────────────────────────

export type Stmt =
  | ExprStmt
  | Assign
  | If
  | While
  | For
  | FuncDef
  | Return
  | Break
  | Continue
  | Pass
  | Block
  | EventHandler;

export type Expr =
  | Literal
  | Ident
  | Call
  | Index
  | Member
  | BinOp
  | UnaryOp
  | ArrayLit
  | Lambda;

export interface ExprStmt { t: "ExprStmt"; expr: Expr; loc?: SourceLoc; }
export interface Assign { t: "Assign"; target: Ident | Index | Member; value: Expr; loc?: SourceLoc; }
export interface If { t: "If"; cond: Expr; then: Stmt[]; else?: Stmt[]; loc?: SourceLoc; }
export interface While { t: "While"; cond: Expr; body: Stmt[]; loc?: SourceLoc; }
export interface For { t: "For"; name: string; iter: Expr; body: Stmt[]; loc?: SourceLoc; }
export interface FuncDef { t: "FuncDef"; name: string; params: string[]; body: Stmt[]; loc?: SourceLoc; }
export interface Return { t: "Return"; value?: Expr; loc?: SourceLoc; }
export interface Break { t: "Break"; loc?: SourceLoc; }
export interface Continue { t: "Continue"; loc?: SourceLoc; }
export interface Pass { t: "Pass"; loc?: SourceLoc; }
export interface Block { t: "Block"; body: Stmt[]; loc?: SourceLoc; }
export interface EventHandler { t: "EventHandler"; event: string; binding?: string; body: Stmt[]; loc?: SourceLoc; }

export interface Literal { t: "Literal"; value: number | string | boolean | null; loc?: SourceLoc; }
export interface Ident { t: "Ident"; name: string; loc?: SourceLoc; }
export interface Call { t: "Call"; callee: Expr; args: Expr[]; loc?: SourceLoc; }
export interface Index { t: "Index"; obj: Expr; key: Expr; loc?: SourceLoc; }
export interface Member { t: "Member"; obj: Expr; name: string; loc?: SourceLoc; }
export interface BinOp { t: "BinOp"; op: BinOpKind; a: Expr; b: Expr; loc?: SourceLoc; }
export interface UnaryOp { t: "UnaryOp"; op: UnaryOpKind; a: Expr; loc?: SourceLoc; }
export interface ArrayLit { t: "ArrayLit"; items: Expr[]; loc?: SourceLoc; }
export interface Lambda { t: "Lambda"; params: string[]; body: Expr; loc?: SourceLoc; }

export type BinOpKind =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "&&" | "||";
export type UnaryOpKind = "-" | "!";

// ──────────────────────────── Script bundle ────────────────────────────

// A script is a sequence of top-level statements: optional FuncDefs,
// zero or more EventHandlers, and a main body (everything else).
export interface Script {
  main: Stmt[];
  handlers: EventHandler[];
  funcs: FuncDef[];
}

// ──────────────────────────── World / entities ────────────────────────────

export interface Pos { x: number; y: number; }

// Phase 11: `kind` is now a free-form string — the template id from
// MONSTER_TEMPLATES (or "hero"). Faction/HUD/damage branching reads `isHero`
// rather than comparing the string.
export type ActorKind = string;

export interface Actor {
  id: string;
  kind: ActorKind;
  // Phase 11: single source of truth for "is this the player?". All code that
  // used to compare kind === "hero" reads this field instead.
  isHero?: boolean;
  hp: number;
  maxHp: number;
  speed: number;
  energy: number;
  pos: Pos;
  script: Script;
  // runtime (populated by interpreter/scheduler)
  alive: boolean;
  // Phase 5 stats (optional on input; normalized to defaults by engine).
  // `int` is reserved: Phase 6 spells will scale by floor(base * (1 + int/10)).
  mp?: number;
  maxMp?: number;
  atk?: number;
  /** reduces incoming melee damage only */
  def?: number;
  int?: number;
  // Phase 14: copied from MonsterTemplate at spawn. applyEffect short-circuits
  // when the incoming kind is in this list (the Hit/damage event still fires;
  // only the effect attachment is suppressed).
  immunities?: EffectKind[];
  effects?: Effect[];
  // Phase 6: list of spell names the actor has learned. Default hero = ["bolt","heal"],
  // default monster = []. Cast validation rejects unknown/unlearned names.
  knownSpells?: string[];
  // Phase 13.7: list of equipment defIds the hero has discovered (mirrors
  // knownSpells). The prep-panel picker reads this to populate per-slot
  // choices; equipping instantiates a fresh ItemRef from the def. Found via
  // pickup; persistent across runs (within a session).
  knownGear?: string[];
  // Phase 13.7: equipment defIds picked up during the current run, awaiting
  // post-run merge into knownGear (mirrors how scrolls are queued in the bag
  // and processed at exit). Cleared after processing.
  foundGear?: string[];
  // Phase 7: inventory. Consumables are a small bag (BAG_SIZE); equipped is
  // one slot per Slot, always present (null when empty).
  inventory?: Inventory;
  // Phase 11: loot-table key (into LOOT_TABLES). Set by createActor from the
  // monster template. Falls back to actor.kind when absent so legacy tests
  // that seed LOOT_TABLES[kind] still work.
  lootTable?: string;
  // Phase 11: optional sprite hints for the renderer. Set by createActor from
  // the template. wire-adapter falls back to MONSTER_TEMPLATES[kind].visual
  // and then to "skeleton" when these are absent.
  visual?: string;
  baseVisual?: string;
  colors?: Record<string, string>;
  // Phase 13: damage-absorption pool added by the shield effect. Drained before
  // hp on incoming physical hits. Zeroed on shield expiry.
  shieldHp?: number;
  // Phase 13.2: faction system.
  // Optional for backward compat — engine falls back to isHero ? "player" : "enemy".
  faction?: "player" | "enemy" | "neutral";
  // Set on summoned actors; undefined on wild actors.
  owner?: string;
  // Shortcut flag set at spawn. Loot tables skip when true.
  summoned?: boolean;
}

// ──────────────────────────── Items (Phase 7 / 13.3) ────────────────────────────

export type Slot = "hat" | "robe" | "staff" | "dagger" | "focus";

export interface ItemInstance {
  id: string;      // instance id (unique per spawn)
  defId: string;   // key into ITEMS
}

export interface Inventory {
  consumables: ItemInstance[];
  equipped: Record<Slot, ItemInstance | null>;
}

// Phase 13.3: unified item kind. "equipment" = wearable.
export type ItemKind = "consumable" | "equipment" | "scroll";
export type StatKey = "atk" | "def" | "int" | "speed" | "maxHp" | "maxMp";

// Primitive op shape — moved here from content/spells.ts so ItemDef can reference
// it without a circular import (spells.ts imports types.ts, not vice-versa).
export type PrimitiveName =
  | "project" | "inflict" | "heal" | "spawn_cloud"
  | "explode" | "summon" | "teleport" | "push"
  | "cleanse" | "permanent_boost";

export interface SpellOp {
  op: PrimitiveName;
  args: Record<string, unknown>;
}

export interface ProcSpec {
  target: "attacker" | "self" | "victim";
  chance?: number;          // 0–100; default 100 (always fires)
  effect?: { kind: EffectKind; duration: number; magnitude?: number };
  damage?: number;          // negative value = heal the target by |damage|
}

export interface AuraSpec {
  kind: EffectKind;
  magnitude?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  /** Phase 13.3: unified kind. "equipment" = wearable. */
  kind: ItemKind;
  level: number;
  // Equipment-only (kind === "equipment")
  slot?: Slot;
  bonuses?: Partial<Record<StatKey, number>>;   // additive stat bonuses
  on_hit?:    ProcSpec;
  on_damage?: ProcSpec;
  on_kill?:   ProcSpec;
  on_cast?:   ProcSpec;
  aura?: AuraSpec;
  // Consumable-only (kind === "consumable")
  useTarget?: "self" | "ally" | "enemy" | "tile";
  range?: number;
  body?: SpellOp[];
  polarity?: "buff" | "debuff";
  // Scroll-only (kind === "scroll")
  spell?: string;
  // Shared optional
  visualPreset?: string;
  help?: import("./ui/help/types.js").HelpMeta;
  // Phase 14: when explicitly false, this item is excluded from any
  // future player-facing loot generation (loot tables, drop pools, prep
  // panel choices). Defaults to true (undefined ≡ true). Used by
  // monster-affinity consumables that ride along in template
  // startingInventory but should never reach the player's hands.
  playerLootable?: boolean;
}

/** @deprecated Use ItemDef with kind checks instead. */
export type ConsumableDef = ItemDef;
/** @deprecated Use ItemDef with kind checks instead. */
export type WearableDef = ItemDef;

// ──────────────────────────── Clouds (Phase 6) ────────────────────────────

export interface Cloud {
  id: string;
  pos: Pos;
  kind: string;         // matches a key in CLOUD_KINDS (fire, frost, ...)
  duration: number;     // total ticks at spawn (post-scaling)
  remaining: number;    // ticks left until expire
  source?: string;      // actor id who spawned it
}

// ──────────────────────────── Effects ────────────────────────────

export type EffectKind =
  | "burning" | "regen" | "haste" | "slow" | "poison"
  | "chill" | "shock" | "expose" | "might" | "iron_skin"
  | "mana_regen" | "mana_burn" | "power" | "shield"
  | "blinded";

export type EffectSource =
  | { type: "actor"; id: string }
  | { type: "item";  id: string };

export interface Effect {
  id: string;
  kind: EffectKind;
  target: string;         // actor id
  magnitude?: number;
  duration: number;       // total ticks; Infinity for permanent
  remaining: number;      // ticks left until expire
  tickEvery: number;      // cadence between onTick calls
  source?: EffectSource;  // discriminated union: actor or item origin
}

export type Direction = "N" | "S" | "E" | "W";

export interface Door { dir: Direction; pos: Pos; }
export interface Item { id: string; kind: string; pos: Pos; }
export interface Chest { id: string; pos: Pos; opened: boolean; }

// Phase 9: items that have been dropped onto the floor (loot drops, overflow
// drops from equip swaps, or explicit hero drop()). Distinct from Room.items
// (scripted/static items) so the loot flow never mutates the designer's list.
export interface FloorItem { id: string; defId: string; pos: Pos; }

// Phase 15: dungeon objects that the hero can interact() with. Stored on
// Room alongside actors. Kind dispatches into render/objects.OBJECT_RENDERERS
// for drawing and into dungeon/objects for interact() behavior.
export type RoomObjectKind =
  | "chest" | "fountain_health" | "fountain_mana"
  | "door_closed" | "exit_door_closed";

export interface RoomObject {
  id: string;
  kind: RoomObjectKind;
  pos: Pos;
  /** True for locked chests/doors. interact() consumes a key when present. */
  locked?: boolean;
  /** Chest loot table id (key into CHEST_LOOT_TABLES). */
  lootTableId?: string;
  /** Walls forming the partition for vault chests; rendered as wall tiles. */
}

/** Wall tile coordinates used to carve interior partitions (vault chests). */
export interface InteriorWall { pos: Pos; }

export interface Room {
  w: number;
  h: number;
  doors: Door[];
  items: Item[];
  chests: Chest[];
  clouds?: Cloud[];
  floorItems?: FloorItem[];
  /** Phase 15: data-driven dungeon objects (chests, fountains, locked doors). */
  objects?: RoomObject[];
  /** Phase 15: extra wall tiles inside the bounding box (vault partitions). */
  interiorWalls?: InteriorWall[];
  /** Phase 15: depth in the current run (1-indexed). */
  depth?: number;
  /** Phase 15: archetype label, used for the BREACHING flash. */
  archetype?: "combat" | "vault" | "conduit" | "cache" | "trap";
}

export interface World {
  tick: number;
  room: Room;
  actors: Actor[];
  log: EventLog;
  aborted: boolean;
  ended: boolean;    // room ended (hero exited / hero died / abort)
  // Phase 9: deterministic RNG state. `rngSeed` is a uint32 mulberry32 state
  // advanced by worldRandom(). Optional on hand-rolled test worlds; the
  // engine's buildWorld() always initializes it from RunOptions.seed.
  rngSeed?: number;
  // Monotonic counter for minting unique FloorItem ids within a run.
  floorSeq?: number;
  // Monotonic counters for minting unique Effect, cloud, item-instance, and actor ids.
  // Stored on World so two runRoom calls with the same seed produce identical
  // sequences regardless of how many prior runs happened in the same process.
  effectSeq?: number;
  primitiveSeq?: number;
  itemSeq?: number;
  // Phase 13.2: monotonic counter for summoned-actor ids.
  actorSeq?: number;
}

// ──────────────────────────── Events / log ────────────────────────────

export type GameEvent =
  | { type: "Moved"; actor: string; from: Pos; to: Pos }
  | { type: "Attacked"; attacker: string; defender: string; damage: number }
  | { type: "Hit"; actor: string; attacker: string; damage: number; shieldAbsorbed?: number; fromProc?: boolean }
  | { type: "Missed"; actor: string; reason: string }
  | { type: "Cast"; actor: string; spell: string; target?: string; amount: number; visual?: string; element?: string }
  | { type: "Healed"; actor: string; amount: number }
  | { type: "Waited"; actor: string }
  | { type: "Died"; actor: string }
  | { type: "HeroDied"; actor: string }
  | { type: "HeroExited"; actor: string; door: Direction }
  | { type: "Halted"; actor: string }
  | { type: "Idled"; actor: string }
  | { type: "ActionFailed"; actor: string; action: string; reason: string }
  | { type: "See"; actor: string; what: string }
  | { type: "EffectApplied"; actor: string; kind: EffectKind; source?: EffectSource }
  | { type: "EffectTick"; actor: string; kind: EffectKind; magnitude?: number }
  | { type: "EffectExpired"; actor: string; kind: EffectKind }
  | { type: "ManaChanged"; actor: string; amount: number }
  | { type: "CloudSpawned"; id: string; pos: Pos; kind: string; visual?: string; element?: string }
  | { type: "CloudTicked"; id: string; appliedTo: string[] }
  | { type: "CloudExpired"; id: string }
  | { type: "VisualBurst"; pos: Pos; visual: string; element?: string }
  | { type: "ItemUsed"; actor: string; item: string; defId: string }
  | { type: "ItemEquipped"; actor: string; item: string; defId: string; slot: Slot }
  | { type: "ItemUnequipped"; actor: string; item: string; defId: string; slot: Slot }
  | { type: "OnHitTriggered"; attacker: string; defender: string; item: string; defId: string }
  | { type: "ItemDropped"; actor: string | null; item: string; defId: string; pos: Pos; source: "death" | "drop" | "overflow" }
  | { type: "ItemPickedUp"; actor: string; item: string; defId: string; pos: Pos }
  | { type: "ScriptError"; actor: string; message: string }
  | { type: "Summoned"; actor: string; summoner: string; template: string; pos: Pos }
  | { type: "Despawned"; actor: string; reason: "room_exit" | "summoner_died" }
  | { type: "SpellLearned"; actor: string; spell: string }
  | { type: "ScrollDiscarded"; actor: string; defId: string; reason: "learned" | "duplicate" }
  | { type: "GearLearned"; actor: string; defId: string }
  | { type: "GearDiscarded"; actor: string; defId: string; reason: "learned" | "duplicate" }
  | { type: "Notified"; actor: string; text: string; style?: "info" | "warning" | "error" | "success"; duration?: number; position?: "top" | "center" | "bottom" }
  | { type: "ObjectInteracted"; actor: string; objectId: string; kind: RoomObjectKind; result: "opened" | "unlocked" | "drained" | "failed:locked" | "failed:no_target" }
  | { type: "ObjectChanged"; objectId: string; kind: RoomObjectKind; locked?: boolean; removed?: boolean };

export interface LogEntry { t: number; event: GameEvent; }
export type EventLog = LogEntry[];

// ──────────────────────────── Pending actions ────────────────────────────

export type PendingAction =
  | { kind: "approach"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "flee"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "attack"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "cast"; cost: number; spell: string; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "wait"; cost: number; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "use"; cost: number; item: unknown; target?: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "pickup"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "drop"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "exit"; cost: number; door: Direction; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "interact"; cost: number; target?: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "halt"; cost: 0; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "summon"; cost: number; template: string; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "notify"; cost: 0; text: string; style?: string; duration?: number; position?: string; loc?: SourceLoc; locals?: Record<string, unknown> };

// ──────────────────────────── Target resolution seam ────────────────────────────

export type ResolveFailureMode = "silent" | "throw" | "cancel";

// ──────────────────────────── Phase 15: persistent run state ────────────────────────────

export interface RunStats {
  attempts: number;
  deepestDepth: number;
  totalKills: number;
  totalItemsCollected: number;
}

export interface PersistentRun {
  depot: ItemInstance[];
  equipped: Record<Slot, ItemInstance | null>;
  knownSpells: string[];
  knownGear: string[];
  stats: RunStats;
  schemaVersion: 1;
}
