// Core types: AST, world/entities, events, pending actions.

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

export interface ExprStmt { t: "ExprStmt"; expr: Expr; }
export interface Assign { t: "Assign"; target: Ident | Index | Member; value: Expr; }
export interface If { t: "If"; cond: Expr; then: Stmt[]; else?: Stmt[]; }
export interface While { t: "While"; cond: Expr; body: Stmt[]; }
export interface For { t: "For"; name: string; iter: Expr; body: Stmt[]; }
export interface FuncDef { t: "FuncDef"; name: string; params: string[]; body: Stmt[]; }
export interface Return { t: "Return"; value?: Expr; }
export interface Block { t: "Block"; body: Stmt[]; }
export interface EventHandler { t: "EventHandler"; event: string; binding?: string; body: Stmt[]; }

export interface Literal { t: "Literal"; value: number | string | boolean | null; }
export interface Ident { t: "Ident"; name: string; }
export interface Call { t: "Call"; callee: Expr; args: Expr[]; }
export interface Index { t: "Index"; obj: Expr; key: Expr; }
export interface Member { t: "Member"; obj: Expr; name: string; }
export interface BinOp { t: "BinOp"; op: BinOpKind; a: Expr; b: Expr; }
export interface UnaryOp { t: "UnaryOp"; op: UnaryOpKind; a: Expr; }
export interface ArrayLit { t: "ArrayLit"; items: Expr[]; }

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
  | { kind: "approach"; cost: number; target: unknown }
  | { kind: "flee"; cost: number; target: unknown }
  | { kind: "attack"; cost: number; target: unknown }
  | { kind: "cast"; cost: number; spell: string; target: unknown }
  | { kind: "wait"; cost: number }
  | { kind: "exit"; cost: number; door: Direction }
  | { kind: "halt"; cost: 0 };

// ──────────────────────────── Target resolution seam ────────────────────────────

export type ResolveFailureMode = "silent" | "throw" | "cancel";
