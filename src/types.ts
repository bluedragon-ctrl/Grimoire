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
}

export type Direction = "N" | "S" | "E" | "W";

export interface Door { dir: Direction; pos: Pos; }
export interface Item { id: string; kind: string; pos: Pos; }
export interface Chest { id: string; pos: Pos; opened: boolean; }

export interface Room {
  w: number;
  h: number;
  doors: Door[];
  items: Item[];
  chests: Chest[];
}

export interface World {
  tick: number;
  room: Room;
  actors: Actor[];
  log: EventLog;
  aborted: boolean;
  ended: boolean;    // room ended (hero exited / hero died / abort)
}

// ──────────────────────────── Events / log ────────────────────────────

export type GameEvent =
  | { type: "Moved"; actor: string; from: Pos; to: Pos }
  | { type: "Attacked"; attacker: string; defender: string; damage: number }
  | { type: "Hit"; actor: string; attacker: string; damage: number }
  | { type: "Missed"; actor: string; reason: string }
  | { type: "Cast"; actor: string; spell: string; target?: string; amount: number }
  | { type: "Healed"; actor: string; amount: number }
  | { type: "Waited"; actor: string }
  | { type: "Died"; actor: string }
  | { type: "HeroDied"; actor: string }
  | { type: "HeroExited"; actor: string; door: Direction }
  | { type: "Halted"; actor: string }
  | { type: "Idled"; actor: string }
  | { type: "ActionFailed"; actor: string; action: string; reason: string }
  | { type: "See"; actor: string; what: string };

export interface LogEntry { t: number; event: GameEvent; }
export type EventLog = LogEntry[];

// ──────────────────────────── Pending actions ────────────────────────────

export type PendingAction =
  | { kind: "approach"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "flee"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "attack"; cost: number; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "cast"; cost: number; spell: string; target: unknown; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "wait"; cost: number; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "exit"; cost: number; door: Direction; loc?: SourceLoc; locals?: Record<string, unknown> }
  | { kind: "halt"; cost: 0; loc?: SourceLoc; locals?: Record<string, unknown> };

// ──────────────────────────── Target resolution seam ────────────────────────────

export type ResolveFailureMode = "silent" | "throw" | "cancel";
