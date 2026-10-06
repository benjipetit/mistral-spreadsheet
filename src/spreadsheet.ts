type CellValue =
  | number
  | string
  | boolean
  | null
  | { error: "#REF!" | "#DIV/0!" | "#CYCLE!" | "#VALUE!" };

interface RecomputeStats {
  evaluatedCells: string[];
}

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'REFERENCE'
  | 'IDENT'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON';

interface Token {
  type: TokenType;
  value: string;
}

interface EvalContext {
  spreadsheet: Spreadsheet;
  toRecompute: Set<string>;
  evaluationStack: Set<string>;
  evaluated: Set<string>;
}

abstract class Expr {
  abstract evaluate(ctx: EvalContext): CellValue;
  abstract getDependencies(spreadsheet: Spreadsheet): Set<string>;
}

class NumberExpr extends Expr {
  constructor(public value: number) {
    super();
  }
  evaluate(_ctx: EvalContext): CellValue {
    return this.value;
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set();
  }
}

class StringExpr extends Expr {
  constructor(public value: string) {
    super();
  }
  evaluate(_ctx: EvalContext): CellValue {
    return this.value;
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set();
  }
}

class BooleanExpr extends Expr {
  constructor(public value: boolean) {
    super();
  }
  evaluate(_ctx: EvalContext): CellValue {
    return this.value;
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set();
  }
}

class NullExpr extends Expr {
  evaluate(_ctx: EvalContext): CellValue {
    return null;
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set();
  }
}

class ReferenceExpr extends Expr {
  constructor(public address: string) {
    super();
  }
  evaluate(ctx: EvalContext): CellValue {
    if (ctx.evaluationStack.has(this.address)) {
      return { error: "#CYCLE!" };
    }
    return ctx.spreadsheet.getCellValueForEvaluation(
      this.address,
      ctx.toRecompute,
      ctx.evaluationStack,
      ctx.evaluated
    );
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set([this.address]);
  }
}

class RangeExpr extends Expr {
  constructor(public start: string, public end: string) {
    super();
  }
  evaluate(ctx: EvalContext): CellValue {
    return { error: "#VALUE!" };
  }
  getDependencies(spreadsheet: Spreadsheet): Set<string> {
    return new Set(spreadsheet.expandRange(this.start, this.end));
  }
}

class UnaryExpr extends Expr {
  constructor(public op: string, public expr: Expr) {
    super();
  }
  evaluate(ctx: EvalContext): CellValue {
    const value = this.expr.evaluate(ctx);
    if (isError(value)) return value;
    const num = toNumber(value);
    if (num === null) return { error: "#VALUE!" };
    return this.op === '-' ? -num : num;
  }
  getDependencies(spreadsheet: Spreadsheet): Set<string> {
    return this.expr.getDependencies(spreadsheet);
  }
}

class BinaryExpr extends Expr {
  constructor(
    public op: string,
    public left: Expr,
    public right: Expr
  ) {
    super();
  }
  evaluate(ctx: EvalContext): CellValue {
    const leftVal = this.left.evaluate(ctx);
    if (isError(leftVal)) return leftVal;
    const rightVal = this.right.evaluate(ctx);
    if (isError(rightVal)) return rightVal;

    if (this.op === '+' || this.op === '-' || this.op === '*' || this.op === '/') {
      const leftNum = toNumber(leftVal);
      const rightNum = toNumber(rightVal);
      if (leftNum === null || rightNum === null) {
        return { error: "#VALUE!" };
      }
      switch (this.op) {
        case '+': return leftNum + rightNum;
        case '-': return leftNum - rightNum;
        case '*': return leftNum * rightNum;
        case '/':
          if (rightNum === 0) return { error: "#DIV/0!" };
          return leftNum / rightNum;
        default: return { error: "#VALUE!" };
      }
    } else {
      const leftComp = toComparable(leftVal);
      const rightComp = toComparable(rightVal);
      if (leftComp === null || rightComp === null) {
        return { error: "#VALUE!" };
      }
      switch (this.op) {
        case '=': return leftComp === rightComp;
        case '!=': return leftComp !== rightComp;
        case '<': return leftComp < rightComp;
        case '<=': return leftComp <= rightComp;
        case '>': return leftComp > rightComp;
        case '>=': return leftComp >= rightComp;
        default: return { error: "#VALUE!" };
      }
    }
  }
  getDependencies(spreadsheet: Spreadsheet): Set<string> {
    const deps = this.left.getDependencies(spreadsheet);
    for (const dep of this.right.getDependencies(spreadsheet)) {
      deps.add(dep);
    }
    return deps;
  }
}

class FunctionExpr extends Expr {
  constructor(public name: string, public args: Expr[]) {
    super();
  }
  evaluate(ctx: EvalContext): CellValue {
    const upperName = this.name.toUpperCase();
    if (upperName === 'IF' && this.args.length === 3) {
      const condition = this.args[0].evaluate(ctx);
      if (isError(condition)) return condition;
      const conditionBool = toBoolean(condition);
      if (conditionBool) {
        return this.args[1].evaluate(ctx);
      } else {
        return this.args[2].evaluate(ctx);
      }
    }

    const argValues: CellValue[] = [];
    for (const arg of this.args) {
      if (arg instanceof RangeExpr) {
        const cells = ctx.spreadsheet.expandRange(arg.start, arg.end);
        for (const addr of cells) {
          argValues.push(
            ctx.spreadsheet.getCellValueForEvaluation(
              addr,
              ctx.toRecompute,
              ctx.evaluationStack,
              ctx.evaluated
            )
          );
        }
      } else {
        argValues.push(arg.evaluate(ctx));
      }
    }

    const numbers: number[] = [];
    for (const v of argValues) {
      if (isError(v)) return v;
      const num = toNumber(v);
      if (num === null) return { error: "#VALUE!" };
      numbers.push(num);
    }

    if (numbers.length === 0) {
      return { error: "#VALUE!" };
    }

    switch (upperName) {
      case 'SUM':
        return numbers.reduce((a, b) => a + b, 0);
      case 'MIN':
        return Math.min(...numbers);
      case 'MAX':
        return Math.max(...numbers);
      default:
        return { error: "#VALUE!" };
    }
  }
  getDependencies(spreadsheet: Spreadsheet): Set<string> {
    const deps = new Set<string>();
    for (const arg of this.args) {
      for (const dep of arg.getDependencies(spreadsheet)) {
        deps.add(dep);
      }
    }
    return deps;
  }
}

class ErrorExpr extends Expr {
  constructor(public error: "#REF!" | "#DIV/0!" | "#CYCLE!" | "#VALUE!") {
    super();
  }
  evaluate(_ctx: EvalContext): CellValue {
    return { error: this.error };
  }
  getDependencies(_spreadsheet: Spreadsheet): Set<string> {
    return new Set();
  }
}

class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;

  parse(input: string): Expr {
    if (!input.startsWith('=')) {
      return new ErrorExpr("#VALUE!");
    }
    const formula = input.substring(1).trim();
    if (formula === '') {
      return new ErrorExpr("#VALUE!");
    }
    this.tokens = this.tokenize(formula);
    this.pos = 0;
    try {
      const expr = this.parseExpression();
      if (this.pos < this.tokens.length) {
        return new ErrorExpr("#VALUE!");
      }
      return expr;
    } catch (e) {
      return new ErrorExpr("#VALUE!");
    }
  }

  private tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
      const c = input[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        let j = i;
        while (j < input.length && /[a-zA-Z]/.test(input[j])) j++;
        let ident = input.substring(i, j);
        let k = j;
        while (k < input.length && /[0-9]/.test(input[k])) k++;
        if (k > j) {
          const ref = input.substring(i, k).toUpperCase();
          tokens.push({ type: 'REFERENCE', value: ref });
          i = k;
        } else {
          const upperIdent = ident.toUpperCase();
          if (upperIdent === 'TRUE') {
            tokens.push({ type: 'BOOLEAN', value: 'true' });
          } else if (upperIdent === 'FALSE') {
            tokens.push({ type: 'BOOLEAN', value: 'false' });
          } else if (upperIdent === 'NULL') {
            tokens.push({ type: 'NULL', value: 'null' });
          } else {
            tokens.push({ type: 'IDENT', value: ident });
          }
          i = j;
        }
      } else if (/[0-9]/.test(c)) {
        let j = i;
        while (j < input.length && /[0-9]/.test(input[j])) j++;
        let numStr = input.substring(i, j);
        if (j < input.length && input[j] === '.') {
          j++;
          while (j < input.length && /[0-9]/.test(input[j])) j++;
          numStr = input.substring(i, j);
        }
        tokens.push({ type: 'NUMBER', value: numStr });
        i = j;
      } else if (c === '"') {
        let j = i + 1;
        while (j < input.length && input[j] !== '"') j++;
        if (j < input.length) {
          const str = input.substring(i + 1, j);
          tokens.push({ type: 'STRING', value: str });
          i = j + 1;
        } else {
          tokens.push({ type: 'STRING', value: input.substring(i + 1) });
          i = input.length;
        }
      } else if (c === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
      } else if (c === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
      } else if (c === ',') {
        tokens.push({ type: 'COMMA', value: ',' });
        i++;
      } else if (c === ':') {
        tokens.push({ type: 'COLON', value: ':' });
        i++;
      } else if (c === '+' || c === '-' || c === '*' || c === '/') {
        tokens.push({ type: 'OPERATOR', value: c });
        i++;
      } else if (c === '=') {
        tokens.push({ type: 'OPERATOR', value: '=' });
        i++;
      } else if (c === '!') {
        if (i + 1 < input.length && input[i + 1] === '=') {
          tokens.push({ type: 'OPERATOR', value: '!=' });
          i += 2;
        } else {
          tokens.push({ type: 'OPERATOR', value: '!' });
          i++;
        }
      } else if (c === '<') {
        if (i + 1 < input.length && input[i + 1] === '=') {
          tokens.push({ type: 'OPERATOR', value: '<=' });
          i += 2;
        } else {
          tokens.push({ type: 'OPERATOR', value: '<' });
          i++;
        }
      } else if (c === '>') {
        if (i + 1 < input.length && input[i + 1] === '=') {
          tokens.push({ type: 'OPERATOR', value: '>=' });
          i += 2;
        } else {
          tokens.push({ type: 'OPERATOR', value: '>' });
          i++;
        }
      } else {
        i++;
      }
    }
    return tokens;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private peekNext(): Token | null {
    return this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1] : null;
  }

  private consume(): Token {
    if (this.pos >= this.tokens.length) {
      return { type: 'RPAREN', value: '' };
    }
    return this.tokens[this.pos++];
  }

  private parseExpression(): Expr {
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    let left = this.parseAddition();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'OPERATOR' && ['=', '!=', '<', '<=', '>', '>='].includes(token.value)) {
        const op = this.consume().value;
        const right = this.parseAddition();
        left = new BinaryExpr(op, left, right);
      } else {
        break;
      }
    }
    return left;
  }

  private parseAddition(): Expr {
    let left = this.parseMultiplication();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'OPERATOR' && (token.value === '+' || token.value === '-')) {
        const op = this.consume().value;
        const right = this.parseMultiplication();
        left = new BinaryExpr(op, left, right);
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplication(): Expr {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'OPERATOR' && (token.value === '*' || token.value === '/')) {
        const op = this.consume().value;
        const right = this.parseUnary();
        left = new BinaryExpr(op, left, right);
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token && token.type === 'OPERATOR' && (token.value === '+' || token.value === '-')) {
      const op = this.consume().value;
      const expr = this.parseUnary();
      return new UnaryExpr(op, expr);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (!token) {
      return new ErrorExpr("#VALUE!");
    }

    if (token.type === 'NUMBER') {
      this.consume();
      const num = parseFloat(token.value);
      if (isNaN(num)) return new ErrorExpr("#VALUE!");
      return new NumberExpr(num);
    } else if (token.type === 'STRING') {
      this.consume();
      return new StringExpr(token.value);
    } else if (token.type === 'BOOLEAN') {
      this.consume();
      return new BooleanExpr(token.value === 'true');
    } else if (token.type === 'NULL') {
      this.consume();
      return new NullExpr();
    } else if (token.type === 'REFERENCE') {
      const refToken = this.consume();
      if (this.peek()?.type === 'COLON') {
        this.consume();
        const endToken = this.peek();
        if (endToken?.type === 'REFERENCE') {
          this.consume();
          return new RangeExpr(refToken.value, endToken.value);
        } else {
          return new ErrorExpr("#REF!");
        }
      } else {
        return new ReferenceExpr(refToken.value);
      }
    } else if (token.type === 'LPAREN') {
      this.consume();
      const expr = this.parseExpression();
      if (this.peek()?.type !== 'RPAREN') {
        return new ErrorExpr("#VALUE!");
      }
      this.consume();
      return expr;
    } else if (token.type === 'IDENT') {
      const identToken = this.consume();
      if (this.peek()?.type !== 'LPAREN') {
        return new ErrorExpr("#VALUE!");
      }
      this.consume();
      const args: Expr[] = [];
      if (this.peek()?.type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek()?.type === 'COMMA') {
          this.consume();
          args.push(this.parseExpression());
        }
      }
      if (this.peek()?.type !== 'RPAREN') {
        return new ErrorExpr("#VALUE!");
      }
      this.consume();
      return new FunctionExpr(identToken.value, args);
    } else {
      this.consume();
      return new ErrorExpr("#VALUE!");
    }
  }
}

class Cell {
  address: string;
  input: string | number | boolean | null;
  value: CellValue;
  parsedFormula: Expr | null = null;
  dependencies: Set<string> = new Set();
  dependents: Set<string> = new Set();

  constructor(address: string) {
    this.address = address;
    this.input = null;
    this.value = null;
  }
}

function isError(value: CellValue): value is { error: "#REF!" | "#DIV/0!" | "#CYCLE!" | "#VALUE!" } {
  return value !== null && typeof value === 'object' && 'error' in value;
}

function toNumber(value: CellValue): number | null {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  return null;
}

function toComparable(value: CellValue): number | null {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return null;
  return null;
}

function toBoolean(value: CellValue): boolean {
  if (value === null) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== '';
  return false;
}

class Spreadsheet {
  private cells: Map<string, Cell> = new Map();
  private stats: RecomputeStats = { evaluatedCells: [] };
  private parser: Parser = new Parser();

  setCell(address: string, input: string | number | boolean | null): void {
    const addr = address.toUpperCase();
    const oldCell = this.cells.get(addr);

    if (oldCell && oldCell.input === input && typeof oldCell.input === typeof input) {
      if (typeof input === 'string' && input.startsWith('=')) {
        const newDeps = this.parser.parse(input).getDependencies(this);
        if (newDeps.size === oldCell.dependencies.size && 
            [...newDeps].every(d => oldCell.dependencies.has(d))) {
          return;
        }
      } else {
        return;
      }
    }

    const cell = oldCell || new Cell(addr);
    const oldDeps: Set<string> = oldCell ? new Set(oldCell.dependencies) : new Set();

    cell.input = input;
    if (typeof input === 'string' && input.startsWith('=')) {
      cell.parsedFormula = this.parser.parse(input);
      cell.dependencies = cell.parsedFormula.getDependencies(this);
    } else {
      cell.parsedFormula = null;
      cell.dependencies = new Set();
    }
    this.cells.set(addr, cell);

    for (const dep of oldDeps) {
      if (!cell.dependencies.has(dep)) {
        const depCell = this.cells.get(dep);
        if (depCell) {
          depCell.dependents.delete(addr);
        }
      }
    }

    for (const dep of cell.dependencies) {
      if (!oldDeps.has(dep)) {
        const depCell = this.cells.get(dep);
        if (depCell) {
          depCell.dependents.add(addr);
        }
      }
    }

    // Also update dependents for the new cell: if any existing cell depends on this cell,
    // add it to this cell's dependents
    for (const [otherAddr, otherCell] of this.cells) {
      if (otherAddr !== addr && otherCell.dependencies.has(addr)) {
        cell.dependents.add(otherAddr);
      }
    }

    // Now also check if any cell that previously depended on addr no longer does
    // (this is already handled by the oldDeps loop above)
    // But we need to make sure all cells that depend on addr are in cell.dependents
    // The above loop handles new dependencies, but we also need to handle removed ones
    // Actually the oldDeps loop already removes from depCell.dependents, so we're good
    // But we need to make sure cell.dependents is complete for the toRecompute calculation
    // Let's rebuild cell.dependents from scratch based on all cells that depend on addr
    cell.dependents = new Set();
    for (const [otherAddr, otherCell] of this.cells) {
      if (otherAddr !== addr && otherCell.dependencies.has(addr)) {
        cell.dependents.add(otherAddr);
      }
    }

    const toRecompute = new Set<string>();
    const stack = [addr];
    while (stack.length > 0) {
      const a = stack.pop()!;
      if (toRecompute.has(a)) continue;
      toRecompute.add(a);
      const c = this.cells.get(a);
      if (c) {
        for (const dep of c.dependents) {
          stack.push(dep);
        }
      }
    }

    this.stats.evaluatedCells = [];
    const evaluated = new Set<string>();
    const evaluationStack = new Set<string>();
    const toRecomputeSorted = Array.from(toRecompute).sort();

    for (const a of toRecomputeSorted) {
      if (!evaluated.has(a)) {
        this.evaluateCell(a, toRecompute, new Set(evaluationStack), evaluated);
      }
    }
  }

  getCell(address: string): CellValue {
    const addr = address.toUpperCase();
    const cell = this.cells.get(addr);
    if (cell) {
      return cell.value;
    }
    return null;
  }

  getStats(): RecomputeStats {
    return { evaluatedCells: [...this.stats.evaluatedCells] };
  }

  resetStats(): void {
    this.stats = { evaluatedCells: [] };
  }

  private evaluateCell(
    addr: string,
    toRecompute: Set<string>,
    evaluationStack: Set<string>,
    evaluated: Set<string>
  ): CellValue {
    const cell = this.cells.get(addr)!;
    
    if (evaluationStack.has(addr)) {
      cell.value = { error: "#CYCLE!" };
      evaluated.add(addr);
      this.stats.evaluatedCells.push(addr);
      return cell.value;
    }
    
    if (evaluated.has(addr)) {
      return cell.value;
    }

    evaluationStack.add(addr);
    let value: CellValue;

    if (cell.parsedFormula) {
      const ctx: EvalContext = {
        spreadsheet: this,
        toRecompute,
        evaluationStack: new Set(evaluationStack),
        evaluated,
      };
      value = cell.parsedFormula.evaluate(ctx);
    } else {
      value = this.toCellValue(cell.input);
    }

    cell.value = value;
    evaluated.add(addr);
    this.stats.evaluatedCells.push(addr);
    evaluationStack.delete(addr);
    return value;
  }

  getCellValueForEvaluation(
    addr: string,
    toRecompute: Set<string>,
    evaluationStack: Set<string>,
    evaluated: Set<string>
  ): CellValue {
    if (toRecompute.has(addr)) {
      if (evaluated.has(addr)) {
        return this.cells.get(addr)!.value;
      } else {
        return this.evaluateCell(addr, toRecompute, evaluationStack, evaluated);
      }
    } else {
      const cell = this.cells.get(addr);
      if (cell) {
        return cell.value;
      } else {
        return null;
      }
    }
  }

  private toCellValue(input: string | number | boolean | null): CellValue {
    if (input === null) return null;
    if (typeof input === 'number') return input;
    if (typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (input === '') return null;
      return input;
    }
    return null;
  }

  expandRange(start: string, end: string): string[] {
    const startAddr = this.parseAddress(start);
    const endAddr = this.parseAddress(end);
    if (startAddr.col === null || startAddr.row === null || endAddr.col === null || endAddr.row === null) {
      return [];
    }
    const minCol = Math.min(startAddr.col, endAddr.col);
    const maxCol = Math.max(startAddr.col, endAddr.col);
    const minRow = Math.min(startAddr.row, endAddr.row);
    const maxRow = Math.max(startAddr.row, endAddr.row);
    const addresses: string[] = [];
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        addresses.push(this.colRowToAddress(col, row));
      }
    }
    return addresses;
  }

  private parseAddress(addr: string): { col: number | null; row: number | null } {
    let i = 0;
    while (i < addr.length && /[A-Z]/.test(addr[i])) i++;
    if (i === 0) return { col: null, row: null };
    const colStr = addr.substring(0, i);
    const rowStr = addr.substring(i);
    if (rowStr === '') return { col: null, row: null };
    const row = parseInt(rowStr, 10);
    if (isNaN(row) || row <= 0) return { col: null, row: null };
    let col = 0;
    for (let j = 0; j < colStr.length; j++) {
      col = col * 26 + (colStr.charCodeAt(j) - 'A'.charCodeAt(0) + 1);
    }
    return { col, row };
  }

  private colRowToAddress(col: number, row: number): string {
    let colStr = '';
    let c = col;
    while (c > 0) {
      c--;
      colStr = String.fromCharCode('A'.charCodeAt(0) + (c % 26)) + colStr;
      c = Math.floor(c / 26);
    }
    return colStr + row;
  }
}

export { Spreadsheet, CellValue, RecomputeStats };
