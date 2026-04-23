// Hand-written recursive-descent parser.
// Source → Token stream → existing AST in src/types.ts.
// Every node carries a { line, col } loc from the source.

import type {
  Script, Stmt, Expr, Ident, Call, Index, Member, BinOp, UnaryOp, ArrayLit,
  Literal, If, While, For, ExprStmt, Assign, EventHandler, FuncDef, BinOpKind,
  SourceLoc, SourcePos,
} from "../types.js";
import { tokenize, type Token } from "./tokenizer.js";
import { ParseError, didYouMean, KNOWN_NAMES } from "./errors.js";

export function parse(source: string): Script {
  const tokens = tokenize(source);
  const p = new Parser(tokens);
  const stmts = p.parseScript();

  const main: Stmt[] = [];
  const handlers: EventHandler[] = [];
  const funcs: FuncDef[] = [];
  for (const s of stmts) {
    if (s.t === "EventHandler") handlers.push(s);
    else if (s.t === "FuncDef") funcs.push(s);
    else main.push(s);
  }
  return { main, handlers, funcs };
}

// ──────────────────────────── parser class ────────────────────────────

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  // ─── helpers ─────────────────────────────────────────────────────

  private peek(off = 0): Token { return this.tokens[this.pos + off]!; }
  private advance(): Token { return this.tokens[this.pos++]!; }
  private atEOF(): boolean { return this.peek().kind === "EOF"; }

  private check(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    if (t.kind !== kind) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  private match(kind: Token["kind"], value?: string): Token | null {
    return this.check(kind, value) ? this.advance() : null;
  }
  private expect(kind: Token["kind"], value: string | undefined, message: string, hint?: string): Token {
    if (this.check(kind, value)) return this.advance();
    const t = this.peek();
    throw new ParseError(t.line, t.col, message, hint);
  }

  private posHere(): SourcePos {
    const t = this.peek();
    return { line: t.line, col: t.col };
  }

  // Build a span from a recorded start position to the end of the last
  // consumed token (end col is token-start col + token length).
  private span(start: SourcePos): SourceLoc {
    const last = this.tokens[this.pos - 1] ?? this.tokens[this.pos]!;
    const len = (last.value ?? "").length || 1;
    return { start, end: { line: last.line, col: last.col + len } };
  }

  // Skip stray NEWLINE tokens (blank-line resilience — tokenizer already
  // drops pure-blank lines, but a dangling newline before EOF is fine).
  private skipNewlines(): void {
    while (this.check("NEWLINE")) this.advance();
  }

  // ─── script ──────────────────────────────────────────────────────

  parseScript(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipNewlines();
    while (!this.atEOF()) {
      stmts.push(this.statement(0));
      this.skipNewlines();
    }
    return stmts;
  }

  // ─── statements ──────────────────────────────────────────────────

  private statement(_depth: number): Stmt {
    const t = this.peek();

    if (t.kind === "KEYWORD") {
      switch (t.value) {
        case "if":     return this.ifStmt();
        case "while":  return this.whileStmt();
        case "for":    return this.forStmt();
        case "on":     return this.onHandler();
        case "return": return this.returnStmt();
        // `halt`, `me`, `true`, `false` are valid at atom level — fall through
        // to simpleStatement so they parse as expressions.
      }
    }

    if (t.kind === "OP" && t.value === ")") {
      throw new ParseError(t.line, t.col, "I found a stray `)` here with no matching `(`.");
    }
    if (t.kind === "DEDENT" || t.kind === "INDENT") {
      throw new ParseError(t.line, t.col, "Unexpected indentation change here.");
    }

    return this.simpleStatement();
  }

  private simpleStatement(): Stmt {
    const start = this.posHere();
    const startTok = this.peek();
    const expr = this.expression();

    // Assignment? `=` but not `==`.
    if (this.check("OP", "=")) {
      const eqTok = this.advance();
      if (!isAssignable(expr)) {
        throw new ParseError(eqTok.line, eqTok.col,
          "I can only assign to a name, a member (obj.name), or an index (xs[0]).");
      }
      const value = this.expression();
      this.consumeNewline(startTok);
      return { t: "Assign", target: expr as any, value, loc: this.span(start) };
    }

    this.consumeNewline(startTok);
    return { t: "ExprStmt", expr, loc: this.span(start) };
  }

  // If the statement started with a NAME close to a keyword, surface a
  // "did you mean `while`?" style hint — otherwise users get a confusing
  // "end of line" error on typo'd keywords.
  private consumeNewline(stmtStart?: Token): void {
    if (this.atEOF()) return;
    if (!this.match("NEWLINE")) {
      const t = this.peek();
      let hint: string | undefined;
      if (stmtStart && stmtStart.kind === "NAME") {
        const s = didYouMean(stmtStart.value,
          ["if", "elif", "else", "while", "for", "on", "return"]);
        if (s) hint = `did you mean \`${s}\`?`;
      }
      throw new ParseError(t.line, t.col, "I expected the end of the line here.", hint);
    }
  }

  private ifStmt(): If {
    const start = this.posHere();
    this.advance(); // 'if'
    const cond = this.expression();
    this.expectColon("if");
    const thenBlock = this.block();

    let elseBlock: Stmt[] | undefined;
    if (this.check("KEYWORD", "elif")) {
      // Elif chain becomes nested if in else branch.
      elseBlock = [this.ifStmt()];
    } else if (this.check("KEYWORD", "else")) {
      this.advance();
      this.expectColon("else");
      elseBlock = this.block();
    }
    const loc = this.span(start);
    return elseBlock
      ? { t: "If", cond, then: thenBlock, else: elseBlock, loc }
      : { t: "If", cond, then: thenBlock, loc };
  }

  private whileStmt(): While {
    const start = this.posHere();
    this.advance();
    const cond = this.expression();
    this.expectColon("while");
    const body = this.block();
    return { t: "While", cond, body, loc: this.span(start) };
  }

  private forStmt(): For {
    const start = this.posHere();
    this.advance();
    const nameTok = this.expect("NAME", undefined, "I expected a variable name after `for`.");
    if (!this.match("KEYWORD", "in")) {
      const t = this.peek();
      throw new ParseError(t.line, t.col, "I expected `in` after the for-variable (e.g. `for x in enemies():`).");
    }
    const iter = this.expression();
    this.expectColon("for");
    const body = this.block();
    return { t: "For", name: nameTok.value, iter, body, loc: this.span(start) };
  }

  private onHandler(): EventHandler {
    const start = this.posHere();
    this.advance(); // 'on'
    if (!this.check("NAME")) {
      const t = this.peek();
      throw new ParseError(t.line, t.col, "I expected an event name after `on` (like `on hit:`).");
    }
    const event = this.advance().value;
    let binding: string | undefined;
    if (this.match("KEYWORD", "as")) {
      const b = this.expect("NAME", undefined, "I expected a binding name after `as`.");
      binding = b.value;
    }
    this.expectColon("on");
    const body = this.block();
    const loc = this.span(start);
    return binding
      ? { t: "EventHandler", event, binding, body, loc }
      : { t: "EventHandler", event, body, loc };
  }

  private returnStmt(): Stmt {
    const start = this.posHere();
    this.advance(); // 'return'
    let value: Expr | undefined;
    if (!this.check("NEWLINE") && !this.atEOF()) {
      value = this.expression();
    }
    this.consumeNewline();
    const loc = this.span(start);
    return value !== undefined
      ? { t: "Return", value, loc }
      : { t: "Return", loc };
  }

  private expectColon(after: string): void {
    if (!this.match("OP", ":")) {
      const t = this.peek();
      throw new ParseError(t.line, t.col, `I expected \`:\` after \`${after}\`.`);
    }
  }

  private block(): Stmt[] {
    if (!this.match("NEWLINE")) {
      const t = this.peek();
      throw new ParseError(t.line, t.col, "I expected a new line before the indented block.");
    }
    // After NEWLINE the tokenizer emits INDENT on the first real line of the block.
    if (!this.match("INDENT")) {
      const t = this.peek();
      throw new ParseError(t.line, t.col,
        "I expected an indented block here.",
        "Indent the lines inside this block (use consistent spaces).");
    }
    const stmts: Stmt[] = [];
    while (!this.check("DEDENT") && !this.atEOF()) {
      stmts.push(this.statement(0));
      this.skipNewlines();
    }
    this.match("DEDENT");
    return stmts;
  }

  // ─── expressions ─────────────────────────────────────────────────

  private expression(): Expr { return this.orExpr(); }

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.match("KEYWORD", "or")) {
      const right = this.andExpr();
      left = mkBin("||", left, right);
    }
    return left;
  }

  private andExpr(): Expr {
    let left = this.notExpr();
    while (this.match("KEYWORD", "and")) {
      const right = this.notExpr();
      left = mkBin("&&", left, right);
    }
    return left;
  }

  private notExpr(): Expr {
    if (this.check("KEYWORD", "not")) {
      const startTok = this.advance();
      const start: SourcePos = { line: startTok.line, col: startTok.col };
      const a = this.notExpr();
      return { t: "UnaryOp", op: "!", a, loc: this.span(start) };
    }
    return this.cmpExpr();
  }

  private cmpExpr(): Expr {
    let left = this.addExpr();
    while (this.check("OP") && isCmpOp(this.peek().value)) {
      const op = this.advance().value as BinOpKind;
      const right = this.addExpr();
      left = mkBin(op, left, right);
    }
    return left;
  }

  private addExpr(): Expr {
    let left = this.mulExpr();
    while (this.checkAny("OP", ["+", "-"])) {
      const op = this.advance().value as BinOpKind;
      const right = this.mulExpr();
      left = mkBin(op, left, right);
    }
    return left;
  }

  private mulExpr(): Expr {
    let left = this.unaryExpr();
    while (this.checkAny("OP", ["*", "/", "%"])) {
      const op = this.advance().value as BinOpKind;
      const right = this.unaryExpr();
      left = mkBin(op, left, right);
    }
    return left;
  }

  private unaryExpr(): Expr {
    if (this.check("OP", "-")) {
      const tok = this.advance();
      const start: SourcePos = { line: tok.line, col: tok.col };
      const a = this.unaryExpr();
      return { t: "UnaryOp", op: "-", a, loc: this.span(start) };
    }
    return this.postfixExpr();
  }

  private postfixExpr(): Expr {
    let expr = this.atom();
    while (true) {
      const start = startOf(expr) ?? this.posHere();
      if (this.match("OP", ".")) {
        const name = this.expect("NAME", undefined, "I expected a member name after `.`.");
        expr = { t: "Member", obj: expr, name: name.value, loc: this.span(start) };
      } else if (this.match("OP", "[")) {
        const key = this.expression();
        if (!this.match("OP", "]")) {
          const t = this.peek();
          throw new ParseError(t.line, t.col, "I expected `]` to close this index.");
        }
        expr = { t: "Index", obj: expr, key, loc: this.span(start) };
      } else if (this.match("OP", "(")) {
        const args: Expr[] = [];
        if (!this.check("OP", ")")) {
          args.push(this.expression());
          while (this.match("OP", ",")) args.push(this.expression());
        }
        if (!this.match("OP", ")")) {
          const t = this.peek();
          throw new ParseError(t.line, t.col, "I expected `)` to close this call — did you miss a matching `(`?");
        }
        expr = { t: "Call", callee: expr, args, loc: this.span(start) };
      } else break;
    }
    return expr;
  }

  private atom(): Expr {
    const t = this.peek();
    const start: SourcePos = { line: t.line, col: t.col };

    if (t.kind === "NUMBER") {
      this.advance();
      return { t: "Literal", value: Number(t.value), loc: this.span(start) };
    }
    if (t.kind === "STRING") {
      this.advance();
      return { t: "Literal", value: t.value, loc: this.span(start) };
    }
    if (t.kind === "NAME") {
      this.advance();
      return { t: "Ident", name: t.value, loc: this.span(start) };
    }
    if (t.kind === "KEYWORD") {
      if (t.value === "true") { this.advance(); return { t: "Literal", value: true, loc: this.span(start) }; }
      if (t.value === "false") { this.advance(); return { t: "Literal", value: false, loc: this.span(start) }; }
      if (t.value === "me") { this.advance(); return { t: "Ident", name: "me", loc: this.span(start) }; }
      if (t.value === "halt") {
        this.advance();
        const loc = this.span(start);
        // If followed by '(', treat as a plain identifier and let postfix
        // apply the call. Otherwise, produce halt() directly.
        if (this.check("OP", "(")) return { t: "Ident", name: "halt", loc };
        return { t: "Call", callee: { t: "Ident", name: "halt", loc }, args: [], loc };
      }
      // Typo of a keyword? Offer suggestion.
      const suggestion = didYouMean(t.value, KNOWN_NAMES);
      throw new ParseError(t.line, t.col,
        `I wasn't expecting the keyword \`${t.value}\` here.`,
        suggestion ? `did you mean \`${suggestion}\`?` : undefined);
    }
    if (t.kind === "OP" && t.value === "(") {
      this.advance();
      const e = this.expression();
      if (!this.match("OP", ")")) {
        const nt = this.peek();
        throw new ParseError(nt.line, nt.col, "I expected `)` to close this group.");
      }
      return e;
    }
    if (t.kind === "OP" && t.value === "[") {
      this.advance();
      const items: Expr[] = [];
      if (!this.check("OP", "]")) {
        items.push(this.expression());
        while (this.match("OP", ",")) items.push(this.expression());
      }
      if (!this.match("OP", "]")) {
        const nt = this.peek();
        throw new ParseError(nt.line, nt.col, "I expected `]` to close this list.");
      }
      return { t: "ArrayLit", items, loc: this.span(start) };
    }

    throw new ParseError(t.line, t.col,
      `I wasn't expecting \`${t.value || t.kind}\` here — I was looking for a value or name.`);
  }

  private checkAny(kind: Token["kind"], values: string[]): boolean {
    const t = this.peek();
    return t.kind === kind && values.includes(t.value);
  }
}

// ──────────────────────────── helpers ────────────────────────────

function isAssignable(e: Expr): boolean {
  return e.t === "Ident" || e.t === "Member" || e.t === "Index";
}

function isCmpOp(v: string): boolean {
  return v === "==" || v === "!=" || v === "<" || v === "<=" || v === ">" || v === ">=";
}

function mkBin(op: BinOpKind, a: Expr, b: Expr): BinOp {
  const base: BinOp = { t: "BinOp", op, a, b };
  const s = a.loc?.start;
  const e = b.loc?.end ?? a.loc?.end;
  if (s && e) base.loc = { start: s, end: e };
  return base;
}

function startOf(e: Expr): SourcePos | undefined {
  return e.loc?.start;
}
