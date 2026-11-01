// Goods distribution expressions, evaluated without compiling code: they come with loaded maps.
// Grammar: built-in calls with number or quoted string arguments, joined by `!`, `&&`, `||` and parentheses.

type Argument = number | string;
type Methods = Readonly<Record<string, unknown>>;
type Expression =
  | { kind: "call"; name: string; args: Argument[] }
  | { kind: "literal"; value: boolean }
  | { kind: "not"; operand: Expression }
  | { kind: "and" | "or"; left: Expression; right: Expression };

export type Distribution = (methods: Methods) => boolean;

type Token = { type: "op" | "number" | "string" | "name"; value: string; at: number };

const TOKEN = /\s*(?:(&&|\|\||[!(),])|(-?\d+(?:\.\d+)?|-?\.\d+)|"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*)|(\S))/y;

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < expression.length) {
    const match = TOKEN.exec(expression);
    if (!match) break; // trailing whitespace
    const at = TOKEN.lastIndex - match[0].trimStart().length;
    const [, op, number, double, single, name, other] = match;
    if (other !== undefined) throw new Error(`Unexpected "${other}" at position ${at + 1}`);
    if (op) tokens.push({ type: "op", value: op, at });
    else if (number) tokens.push({ type: "number", value: number, at });
    else if (double !== undefined || single !== undefined)
      tokens.push({ type: "string", value: double ?? single ?? "", at });
    else if (name) tokens.push({ type: "name", value: name, at });
  }
  return tokens;
}

function parse(expression: string, names: ReadonlySet<string>): Expression {
  const tokens = tokenize(expression);
  let index = 0;

  const peek = () => tokens[index];
  const isOp = (token: Token | undefined, value: string) => token?.type === "op" && token.value === value;
  const fail = (token?: Token): never => {
    throw new Error(token ? `Unexpected "${token.value}" at position ${token.at + 1}` : "Unexpected end of expression");
  };
  const expect = (value: string) => {
    const token = tokens[index++];
    if (!isOp(token, value)) fail(token);
  };

  const parseOr = (): Expression => {
    let left = parseAnd();
    while (isOp(peek(), "||")) {
      index++;
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };

  const parseAnd = (): Expression => {
    let left = parseNot();
    while (isOp(peek(), "&&")) {
      index++;
      left = { kind: "and", left, right: parseNot() };
    }
    return left;
  };

  const parseNot = (): Expression => {
    if (isOp(peek(), "!")) {
      index++;
      return { kind: "not", operand: parseNot() };
    }
    return parsePrimary();
  };

  const parsePrimary = (): Expression => {
    const token = tokens[index++];
    if (isOp(token, "(")) {
      const inner = parseOr();
      expect(")");
      return inner;
    }
    if (token?.type !== "name") return fail(token);
    if (token.value === "true" || token.value === "false") return { kind: "literal", value: token.value === "true" };
    if (!names.has(token.value)) throw new Error(`Unknown function "${token.value}" at position ${token.at + 1}`);

    expect("(");
    const args: Argument[] = [];
    while (!isOp(peek(), ")")) {
      if (args.length) expect(",");
      const arg = tokens[index++];
      if (arg?.type === "number") args.push(Number(arg.value));
      else if (arg?.type === "string") args.push(arg.value);
      else fail(arg);
    }
    expect(")");
    return { kind: "call", name: token.value, args };
  };

  const tree = parseOr();
  if (index < tokens.length) fail(tokens[index]);
  return tree;
}

// short-circuits like JS, so the random checks draw the same numbers the expression always did
function evaluate(node: Expression, methods: Methods): boolean {
  switch (node.kind) {
    case "call": {
      const method = methods[node.name];
      if (typeof method !== "function") throw new Error(`Unknown function "${node.name}"`);
      return Boolean(method(...node.args));
    }
    case "literal":
      return node.value;
    case "not":
      return !evaluate(node.operand, methods);
    case "and":
      return evaluate(node.left, methods) && evaluate(node.right, methods);
    case "or":
      return evaluate(node.left, methods) || evaluate(node.right, methods);
  }
}

/** Parse a distribution once; throws a readable error on anything outside the grammar or an unknown function */
export function compileDistribution(expression: string, names: readonly string[]): Distribution {
  const tree = parse(expression, new Set(names));
  return methods => evaluate(tree, methods);
}
