// Relief icons drawn as plain shapes in map coordinates. A `<use>` per icon gives the browser a transform node per icon,
// and thousands of them make every zoom frame re-layerize the map; shapes already placed share one. Art the copy could
// not draw identically (clipped by its frame, stretched strokes, paint servers) keeps its `<use>`

type Matrix = [number, number, number, number, number, number]; // a b c d e f, as in SVG

interface Shape {
  attrs: string; // presentation attributes, stroke-width and dashes left out
  stroke: number | null; // stroke width in units of the drawn icon size, null when inherited unscaled
  dashes: number[] | null; // the same, for stroke-dasharray
  points: Float64Array; // x y pairs in units of the icon size: M takes 1, L 1, C 3
  commands: string; // one letter per segment: M L C Z
}

type Node = { group: string; children: Node[] } | Shape;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const SHAPES = new Set(["path", "polygon", "polyline", "rect", "circle", "ellipse"]);
const SKIPPED = new Set(["title", "desc", "metadata"]);
const GEOMETRY = new Set(["d", "points", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "transform"]);
const UNSCALED = new Set(["stroke-width", "stroke-dasharray"]);
const FRAME = new Set(["viewBox", "preserveAspectRatio", "overflow", "version"]); // the symbol's own, not its art's
const KAPPA = 0.5522847498; // control point distance of a quarter circle drawn as a cubic

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
];

function parseTransform(value: string | null): Matrix | null {
  let matrix: Matrix = IDENTITY;
  if (!value) return matrix;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  if (value.replace(pattern, "").replace(/[\s,]/g, "")) return null; // anything else is not a transform list

  for (const [, name, list] of value.matchAll(pattern)) {
    const v = (list.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let next: Matrix;
    if (name === "matrix" && v.length === 6) next = v as Matrix;
    else if (name === "translate") next = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (name === "scale") next = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const angle = ((v[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      next = multiply(multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === "skewX") next = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === "skewY") next = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    else return null;
    matrix = multiply(matrix, next);
  }
  return matrix;
}

/** Path data as absolute M, L, C and Z, arcs and quadratics turned into cubics */
export function parsePath(d: string): { commands: string; points: number[] } | null {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return null;
  let index = 0;
  let commands = "";
  const points: number[] = [];
  let [x, y, startX, startY] = [0, 0, 0, 0];
  let [lastControlX, lastControlY, lastKind] = [0, 0, ""];

  const isNumber = () => index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]);
  const num = () => Number(tokens[index++]);
  // arc flags may be written without separators: "a1 1 0 01 5 5"
  const flag = () => {
    const token = tokens[index];
    if (token === "0" || token === "1") {
      index++;
      return Number(token);
    }
    if (/^[01]\d/.test(token)) {
      tokens[index] = token.slice(1);
      return Number(token[0]);
    }
    return Number.NaN;
  };
  const line = (toX: number, toY: number) => {
    commands += "L";
    points.push(toX, toY);
    [x, y, lastKind] = [toX, toY, "L"];
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, toX: number, toY: number, kind = "C") => {
    commands += "C";
    points.push(x1, y1, x2, y2, toX, toY);
    [lastControlX, lastControlY, x, y, lastKind] = [x2, y2, toX, toY, kind];
  };
  const quadratic = (qx: number, qy: number, toX: number, toY: number) => {
    cubic(
      x + ((qx - x) * 2) / 3,
      y + ((qy - y) * 2) / 3,
      toX + ((qx - toX) * 2) / 3,
      toY + ((qy - toY) * 2) / 3,
      toX,
      toY
    );
    [lastControlX, lastControlY, lastKind] = [qx, qy, "Q"];
  };

  let command = "";
  while (index < tokens.length) {
    if (!isNumber()) command = tokens[index++];
    else if (!command) return null;
    const relative = command === command.toLowerCase();
    const [ox, oy] = relative ? [x, y] : [0, 0];

    switch (command.toUpperCase()) {
      case "M": {
        if (!isNumber()) return null;
        const [toX, toY] = [num() + ox, num() + oy];
        commands += "M";
        points.push(toX, toY);
        [x, y, startX, startY, lastKind] = [toX, toY, toX, toY, "M"];
        command = relative ? "l" : "L"; // further pairs are lines
        break;
      }
      case "L":
        line(num() + ox, num() + oy);
        break;
      case "H":
        line(num() + (relative ? x : 0), y);
        break;
      case "V":
        line(x, num() + (relative ? y : 0));
        break;
      case "C":
        cubic(num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      case "S": {
        const [cx, cy] = lastKind === "C" ? [2 * x - lastControlX, 2 * y - lastControlY] : [x, y];
        cubic(cx, cy, num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      }
      case "Q":
        quadratic(num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      case "T": {
        const [qx, qy] = lastKind === "Q" ? [2 * x - lastControlX, 2 * y - lastControlY] : [x, y];
        quadratic(qx, qy, num() + ox, num() + oy);
        break;
      }
      case "A": {
        const [rx, ry, rotation] = [num(), num(), num()];
        const [large, sweep] = [flag(), flag()];
        const [toX, toY] = [num() + ox, num() + oy];
        if (Number.isNaN(large) || Number.isNaN(sweep)) return null;
        for (const c of arcToCubics(x, y, rx, ry, rotation, large, sweep, toX, toY)) cubic(...c);
        break;
      }
      case "Z":
        commands += "Z";
        [x, y, lastKind] = [startX, startY, "Z"];
        command = "";
        break;
      default:
        return null;
    }
  }
  return points.some(Number.isNaN) ? null : { commands, points };
}

type Cubic = [number, number, number, number, number, number];

/** SVG arc endpoint parameters to cubic segments, each covering at most a quarter turn (SVG 1.1 F.6.5) */
function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number
): Cubic[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];

  const phi = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];

  const sign = large === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
  const root = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * py * py + ry * ry * px * px)));
  const cxp = (root * rx * py) / ry;
  const cyp = (-root * ry * px) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angle(1, 0, (px - cxp) / rx, (py - cyp) / ry);
  let delta = angle((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos
  ];
  const derivative = (t: number): [number, number] => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos
  ];

  const cubics: Cubic[] = [];
  for (let i = 0; i < segments; i++) {
    const [a, b] = [theta + i * step, theta + (i + 1) * step];
    const [p0, p3, d0, d3] = [point(a), point(b), derivative(a), derivative(b)];
    if (i === segments - 1) p3.splice(0, 2, x2, y2);
    cubics.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
  }
  return cubics;
}

const attr = (element: Element, name: string) => Number(element.getAttribute(name) ?? 0);

/** A basic shape as path data, or null for one this module does not draw */
function shapePath(element: Element): { commands: string; points: number[] } | null {
  switch (element.tagName) {
    case "path":
      return parsePath(element.getAttribute("d") ?? "");
    case "polygon":
    case "polyline": {
      const values = (element.getAttribute("points")?.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(
        Number
      );
      if (values.length < 4 || values.length % 2) return null;
      const count = values.length / 2;
      const commands = `M${"L".repeat(count - 1)}${element.tagName === "polygon" ? "Z" : ""}`;
      return { commands, points: values };
    }
    case "rect": {
      if (attr(element, "rx") || attr(element, "ry")) return null;
      const [x, y, w, h] = [attr(element, "x"), attr(element, "y"), attr(element, "width"), attr(element, "height")];
      if (w <= 0 || h <= 0) return { commands: "", points: [] };
      return { commands: "MLLLZ", points: [x, y, x + w, y, x + w, y + h, x, y + h] };
    }
    case "circle":
    case "ellipse": {
      const [cx, cy] = [attr(element, "cx"), attr(element, "cy")];
      const rx = element.tagName === "circle" ? attr(element, "r") : attr(element, "rx");
      const ry = element.tagName === "circle" ? rx : attr(element, "ry");
      if (rx <= 0 || ry <= 0) return { commands: "", points: [] };
      const [kx, ky] = [rx * KAPPA, ry * KAPPA];
      // prettier-ignore
      const points = [
        cx + rx,
        cy,
        cx + rx,
        cy + ky,
        cx + kx,
        cy + ry,
        cx,
        cy + ry,
        cx - kx,
        cy + ry,
        cx - rx,
        cy + ky,
        cx - rx,
        cy,
        cx - rx,
        cy - ky,
        cx - kx,
        cy - ry,
        cx,
        cy - ry,
        cx + kx,
        cy - ry,
        cx + rx,
        cy - ky,
        cx + rx,
        cy
      ];
      return { commands: "MCCCCZ", points };
    }
    default:
      return null;
  }
}

/** The presentation attributes an element passes on, or null when one cannot be copied as it is */
function copyAttributes(element: Element): string | null {
  let attrs = "";
  for (const { name, value } of Array.from(element.attributes)) {
    if (GEOMETRY.has(name) || UNSCALED.has(name) || FRAME.has(name) || name === "id") continue;
    if (
      name === "stroke-dashoffset" ||
      name === "style" ||
      name === "class" ||
      name.startsWith("clip") ||
      name === "mask" ||
      name === "filter"
    )
      return null;
    if (value.includes("url(")) return null;
    if (name === "vector-effect") return null;
    attrs += ` ${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
  }
  return attrs;
}

/** The stroke width and dashes an element paints with in its own units, from itself or the art above it */
function inheritedStroke(element: Element, symbol: Element): { width: string | null; dashes: string | null } {
  let [width, dashes]: (string | null)[] = [null, null];
  for (let node: Element | null = element; node; node = node.parentElement) {
    width ??= node.getAttribute("stroke-width");
    dashes ??= node.getAttribute("stroke-dasharray");
    if (node === symbol) break;
  }
  return { width, dashes };
}

const isStroked = (element: Element, symbol: Element): boolean => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const stroke = node.getAttribute("stroke");
    if (stroke !== null) return stroke !== "none";
    if (node === symbol) break;
  }
  return true; // the relief layer's stroke
};

interface Compiled {
  nodes: Node[];
  attrs: string; // the symbol's own presentation attributes
}

/** The symbol's art in units of the drawn icon size, or null when the copy would not look the same */
function compile(symbol: Element): Compiled | null {
  const box = (symbol.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some(v => !Number.isFinite(v)) || box[2] <= 0 || box[3] <= 0) return null;
  const aspect = symbol.getAttribute("preserveAspectRatio");
  if (aspect && aspect !== "xMidYMid meet" && aspect !== "xMidYMid") return null;
  const overflowVisible = symbol.getAttribute("overflow") === "visible";

  // xMidYMid meet into a 1 × 1 box
  const [vx, vy, vw, vh] = box;
  const unit = 1 / Math.max(vw, vh);
  const toUnit: Matrix = [unit, 0, 0, unit, (1 - vw * unit) / 2 - vx * unit, (1 - vh * unit) / 2 - vy * unit];
  const frame = [(1 - vw * unit) / 2, (1 - vh * unit) / 2, (1 + vw * unit) / 2, (1 + vh * unit) / 2];

  const attrs = copyAttributes(symbol);
  if (attrs === null || symbol.hasAttribute("transform")) return null;

  const walk = (parent: Element, matrix: Matrix): Node[] | null => {
    const nodes: Node[] = [];
    for (const element of Array.from(parent.children)) {
      if (SKIPPED.has(element.tagName)) continue;
      const local = parseTransform(element.getAttribute("transform"));
      if (!local) return null;
      const ctm = multiply(matrix, local);
      const own = copyAttributes(element);
      if (own === null) return null;

      if (element.tagName === "g") {
        const children = walk(element, ctm);
        if (!children) return null;
        nodes.push({ group: own, children });
        continue;
      }
      if (!SHAPES.has(element.tagName)) return null;
      const path = shapePath(element);
      if (!path) return null;

      // a stroke keeps its width only where the art is scaled evenly
      const [a, b, c, d] = ctm;
      const scaleX = Math.hypot(a, b);
      const scaleY = Math.hypot(c, d);
      const stroked = isStroked(element, symbol);
      if (stroked && (Math.abs(scaleX - scaleY) > 1e-3 * Math.max(scaleX, scaleY) || Math.abs(a * c + b * d) > 1e-6))
        return null;
      const scale = Math.sqrt(Math.abs(a * d - b * c));
      const { width, dashes } = inheritedStroke(element, symbol);
      if (stroked && width === null) return null; // the layer's own width is not ours to scale
      const strokeWidth = width === null ? null : Number.parseFloat(width) * scale;
      if (strokeWidth !== null && !Number.isFinite(strokeWidth)) return null;
      const dashList =
        dashes && dashes !== "none"
          ? dashes
              .split(/[\s,]+/)
              .filter(Boolean)
              .map(v => Number(v) * scale)
          : null;
      if (dashList?.some(v => !Number.isFinite(v))) return null;

      const points = new Float64Array(path.points.length);
      for (let i = 0; i < path.points.length; i += 2) {
        const [x, y] = [path.points[i], path.points[i + 1]];
        points[i] = a * x + c * y + ctm[4];
        points[i + 1] = b * x + d * y + ctm[5];
      }

      // a symbol clips its art to its frame: art reaching past it would be drawn in full here
      if (!overflowVisible) {
        const margin = stroked && strokeWidth ? strokeWidth / 2 : 0;
        for (let i = 0; i < points.length; i += 2) {
          const [x, y] = [points[i], points[i + 1]];
          if (x - margin < frame[0] - 1e-6 || y - margin < frame[1] - 1e-6) return null;
          if (x + margin > frame[2] + 1e-6 || y + margin > frame[3] + 1e-6) return null;
        }
      }

      nodes.push({ attrs: own, stroke: strokeWidth, dashes: dashList, points, commands: path.commands });
    }
    return nodes;
  };

  const nodes = walk(symbol, toUnit);
  return nodes && { nodes, attrs };
}

const fine = (value: number) => Math.round(value * 1000) / 1000; // stroke widths are a fraction of a map unit

function drawNodes(nodes: Node[], left: number, top: number, size: number): string {
  let markup = "";
  for (const node of nodes) {
    if ("group" in node) {
      markup += `<g${node.group}>${drawNodes(node.children, left, top, size)}</g>`;
      continue;
    }
    const { points, commands } = node;
    if (!commands) continue;
    // points are rounded to hundredths, then written relative to the last one: short, and the rounding never drifts
    let d = "";
    let p = 0;
    let [x, y, startX, startY] = [0, 0, 0, 0];
    let afterLetter = true;
    const write = (value: number) => {
      d += value < 0 || afterLetter ? String(value / 100) : ` ${value / 100}`; // a minus sign separates on its own
      afterLetter = false;
    };
    for (const command of commands) {
      if (command === "Z") {
        d += "z";
        [x, y, afterLetter] = [startX, startY, true];
        continue;
      }
      const count = command === "C" ? 3 : 1;
      const [fromX, fromY] = [x, y];
      d += command === "M" ? "M" : command.toLowerCase();
      afterLetter = true;
      for (let i = 0; i < count; i++, p += 2) {
        const pointX = Math.round((left + points[p] * size) * 100);
        const pointY = Math.round((top + points[p + 1] * size) * 100);
        write(command === "M" ? pointX : pointX - fromX);
        write(command === "M" ? pointY : pointY - fromY);
        [x, y] = [pointX, pointY];
      }
      if (command === "M") [startX, startY] = [x, y];
    }
    const stroke = node.stroke === null ? "" : ` stroke-width="${fine(node.stroke * size)}"`;
    const dashes = node.dashes ? ` stroke-dasharray="${node.dashes.map(v => fine(v * size)).join(" ")}"` : "";
    markup += `<path d="${d}"${node.attrs}${stroke}${dashes}/>`;
  }
  return markup;
}

const cache = new Map<string, Compiled | null>();

/** Markup of a relief icon drawn as shapes in a `size` box at `left, top`, or null to draw it with a `<use>` */
export function drawReliefShapes(
  symbolId: string,
  left: number,
  top: number,
  size: number,
  attributes = ""
): string | null {
  let compiled = cache.get(symbolId);
  if (compiled === undefined) {
    if (!symbolId.startsWith("relief-")) return null; // own art may change under its id
    const symbol = document.getElementById(symbolId);
    if (!symbol) return null; // still loading: the next draw tries again
    compiled = compile(symbol);
    cache.set(symbolId, compiled);
  }
  if (!compiled) return null;
  return `<g${attributes}${compiled.attrs}>${drawNodes(compiled.nodes, left, top, size)}</g>`;
}
