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
  | ArrayLit;

export interface ExprStmt { t: "ExprStmt"; expr: Expr; loc?: SourceLoc; }
export interface Assign { t: "Assign"; target: Ident | Index | Member; value: Expr; loc?: SourceLoc; }
export interface If { t: "If"; cond: Expr; then: Stmt[]; else?: Stmt[]; loc?: SourceLoc; }
export interface While { t: "While"; cond: Expr; body: Stmt[]; loc?: SourceLoc; }
export interface For { t: "For"; name: string; iter: Expr; body: Stmt[]; loc?: SourceLoc; }
export interface FuncDef { t: "FuncDef"; name: string; params: string[]; body: Stmt[]; loc?: SourceLoc; }
export interface Return { t: "Return"; value?: Expr; loc?: SourceLoc; }
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

export type ActorKind = "hero" | "goblin";

export interface Actor {
  id: string;
  kind: ActorKind;
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
  def?: number;
  int?: number;
  effects?: Effect[];
  // Phase 6: list of spell names the actor has learned. Default hero = ["bolt","heal"],
  // default goblin = []. Cast validation rejects unknown/unlearned names.
  knownSpells?: string[];
  // Phase 7: inventory. Consumables are a small bag (BAG_SIZE); equipped is
  // one slot per Slot, always present (null when empty).
  inventory?: Inventory;
}

// ──────────────────────────── Items (Phase 7) ────────────────────────────

export type Slot = "hat" | "robe" | "staff" | "dagger" | "focus";

export interface ItemInstance {
  id: string;      // instance id (unique per spawn)
  defId: string;   // key into ITEMS
}

export interface Inventory {
  consumables: ItemInstance[];
  equipped: Record<Slot, ItemInstance | null>;
}

export type ItemCategory = "consumable" | "wearable";

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  slot?: Slot;            // required when category === "wearable"
  script: string;         // item-script source; parsed at registry load
  visualPreset?: string;  // key into ITEM_VISUAL_PRESETS (default: id)
}

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

export type EffectKind = "burning" | "regen" | "haste" | "slow" | "poison";

export interface Effect {
  id: string;
  kind: EffectKind;
  target: string;         // actor id
  magnitude?: number;
  duration: number;       // total ticks; Infinity for permanent
  remaining: number;      // ticks left until expire
  tickEvery: number;      // cadence between onTick calls
  source?: string;        // optional: who applied it
}

export type Direction = "N" | "S" | "E" | "W";

export interface Door { dir: Direction; pos: Pos; }
export interface Item { id: string; kind: string; pos: Pos; }
export interface Chest { id: string; pos: Pos; opened: boolean; }

// Phase 9: items that have been dropped onto the floor (loot drops, overflow
// drops from equip swaps, or explicit hero drop()). Distinct from Room.items
// (scripted/static items) so the loot flow never mutates the designer's list.
export interface FloorItem { id: string; defId: string; pos: Pos; }

export interface Room {
  w: number;
  h: number;
  doors: Door[];
  items: Item[];
  chests: Chest[];
  clouds?: Cloud[];
  floorItems?: FloorItem[];
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
}

// ──────────────────────────── Events / log ────────────────────────────

export type GameEvent =
  | { type: "Moved"; actor: string; from: Pos; to: Pos }
  | { type: "Attacked"; attacker: string; defender: string; damage: number }
  | { type: "Hit"; actor: string; attacker: string; damage: number }
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
  | { type: "EffectApplied"; actor: string; kind: EffectKind; source?: string }
  | { type: "EffectTick"; actor: string; kind: EffectKind; magnitude?: number }
  | { type: "EffectExpired"; actor: string; kind: EffectKind }
  | { type: "CloudSpawned"; id: string; pos: Pos; kind: string; visual?: string; element?: string }
  | { type: "CloudTicked"; id: string; appliedTo: string[] }
  | { type: "CloudExpired"; id: string }
  | { type: "VisualBurst"; pos: Pos; visual: string; element?: string }
  | { type: "ItemUsed"; actor: string; item: string; defId: string }
  | { type: "ItemEquipped"; actor: string; item: string; defId: string; slot: Slot }
  | { type: "ItemUnequipped"; actor: string; item: string; defId: string; slot: Slot }
  | { type: "OnHitTriggered"; attacker: string; defender: string; item: string; defId: string }
  | { type: "ItemDropped"; actor: string | null; item: string; defId: string; pos: Pos; source: "death" | "drop" | "overflow" }
  | { type: "ItemPickedUp"; actor: string; item: string; defId: string; pos: Pos };

export interface LogEntry { t: number; event: GameEvent; }
export type EventLog = LogEntry[];

// ──────────────────────────── Pending actions ────────────────────────────

export type PendingAction =
  | { kind: "approach"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "flee"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "attack"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "cast"; cost: number; spell: string; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "wait"; cost: number; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "use"; cost: number; item: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "pickup"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "drop"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "exit"; cost: number; door: Direction; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "halt"; cost: 0; loc?: SourceLoc; locals?: Record<string, unknown> };

// ──────────────────────────── Target resolution seam ────────────────────────────

export type ResolveFailureMode = "silent" | "throw" | "cancel";
