// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { drawReliefShapes, parsePath } from "./relief-shapes";

let next = 0;
/** a symbol in the page, under a fresh id since compiled art is cached by id */
const symbol = (body: string, attributes = 'viewBox="0 0 10 10" stroke-width="1"'): string => {
  const id = `relief-test-${next++}`;
  document.body.insertAdjacentHTML("beforeend", `<svg><symbol id="${id}" ${attributes}>${body}</symbol></svg>`);
  return id;
};

/** the absolute points of path data written by the module: M absolute, l and c relative, z back to the start */
const absolute = (d: string): number[][] => {
  const parsed = parsePath(d)!;
  const points: number[][] = [];
  for (let i = 0; i < parsed.points.length; i += 2) points.push([parsed.points[i], parsed.points[i + 1]]);
  return points;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("parsePath", () => {
  it("turns relative, horizontal, vertical and smooth commands into absolute M, L, C", () => {
    const { commands, points } = parsePath("m1 2 3 4h2v-1H0V0zs1 1 2 2")!;
    expect(commands).toBe("MLLLLLZC");
    expect(points.slice(0, 12)).toEqual([1, 2, 4, 6, 6, 6, 6, 5, 0, 5, 0, 0]);
    expect(points.slice(-2)).toEqual([3, 4]); // after z the pen is back at 1 2
  });

  it("draws quadratics as the equivalent cubics", () => {
    const { commands, points } = parsePath("M0 0Q3 3 6 0")!;
    expect(commands).toBe("MC");
    expect(points).toEqual([0, 0, 2, 2, 4, 2, 6, 0]);
  });

  it("reads arc flags written without separators", () => {
    const spaced = parsePath("M0 0a5 5 0 0 1 10 0")!;
    const compact = parsePath("M0 0a5 5 0 0110 0")!;
    expect(compact).toEqual(spaced);
    const end = spaced.points.slice(-2);
    expect(end[0]).toBeCloseTo(10);
    expect(end[1]).toBeCloseTo(0);
    // the half circle bulges up through (5, -5): sweep 1 goes clockwise in y-down space
    expect(Math.min(...spaced.points.filter((_, i) => i % 2))).toBeLessThan(-3.5);
  });

  it("rejects malformed data", () => {
    expect(parsePath("1 2 3")).toBeNull();
    expect(parsePath("M0 0 L5")).toBeNull();
    expect(parsePath("M0 0a5 5 0 2 1 10 0")).toBeNull();
  });
});

describe("drawReliefShapes", () => {
  it("places the art in the icon box like a use would", () => {
    const id = symbol('<path d="M1 1L9 9" stroke="#000"/>');
    const markup = drawReliefShapes(id, 100, 200, 4, ' data-id="7"')!;
    document.body.insertAdjacentHTML("beforeend", `<svg>${markup}</svg>`);

    const group = document.querySelector('g[data-id="7"]')!;
    const path = group.querySelector("path")!;
    const [start, end] = absolute(path.getAttribute("d")!);
    expect(start).toEqual([100.4, 200.4]);
    expect(end[0]).toBeCloseTo(103.6, 9);
    expect(end[1]).toBeCloseTo(203.6, 9);
    expect(path.getAttribute("stroke")).toBe("#000");
    expect(path.getAttribute("stroke-width")).toBe("0.4"); // 1 unit of a 10-unit frame drawn 4 wide
  });

  it("centres a frame that is not square, as xMidYMid meet does", () => {
    const id = symbol('<rect x="0" y="0" width="20" height="10" stroke="none"/>', 'viewBox="0 0 20 10"');
    const markup = drawReliefShapes(id, 0, 0, 10)!;
    document.body.insertAdjacentHTML("beforeend", `<svg>${markup}</svg>`);
    const points = absolute(document.querySelector("path")!.getAttribute("d")!);
    expect(points[0]).toEqual([0, 2.5]);
    expect(points[2]).toEqual([10, 7.5]);
  });

  it("applies inner transforms and scales stroke widths with them", () => {
    const id = symbol('<g transform="translate(5 5) scale(0.5)"><circle cx="0" cy="0" r="4" stroke-width="2"/></g>');
    const markup = drawReliefShapes(id, 0, 0, 10)!;
    document.body.insertAdjacentHTML("beforeend", `<svg>${markup}</svg>`);
    const path = document.querySelector("path")!;
    const xs = absolute(path.getAttribute("d")!).map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(3);
    expect(Math.max(...xs)).toBeCloseTo(7);
    expect(path.getAttribute("stroke-width")).toBe("1"); // 2 at half scale
  });

  it("keeps the art's own colours and order, and the frame's attributes off the copy", () => {
    const id = symbol(
      '<polygon points="1,1 9,1 5,9" fill="#a00" stroke="none"/><ellipse cx="5" cy="5" rx="2" ry="1" fill="#0a0" stroke="none"/>',
      'viewBox="0 0 10 10" fill="#fff"'
    );
    const markup = drawReliefShapes(id, 0, 0, 10)!;
    expect(markup).not.toContain("viewBox");
    document.body.insertAdjacentHTML("beforeend", `<svg>${markup}</svg>`);
    const fills = Array.from(document.querySelectorAll("path")).map(path => path.getAttribute("fill"));
    expect(fills).toEqual(["#a00", "#0a0"]);
    expect(document.querySelector("g")!.getAttribute("fill")).toBe("#fff");
  });

  it("leaves to a use what it cannot draw the same", () => {
    const cases = [
      '<path d="M0 0L10 10" transform="scale(1 0.5)"/>', // a stroke stretched unevenly
      '<path d="M-5 0L5 5" stroke="none"/>', // art past the frame, which the symbol clips
      '<path d="M0 0L5 5" fill="url(#gradient)"/>',
      '<path d="M0 0L5 5" style="fill: red"/>',
      '<text x="1" y="5">A</text>',
      '<rect x="1" y="1" width="5" height="5" rx="1"/>'
    ];
    for (const body of cases) expect(drawReliefShapes(symbol(body), 0, 0, 10), body).toBeNull();
    expect(drawReliefShapes(symbol('<path d="M0 0L10 10"/>', 'viewBox="0 0 10 10"'), 0, 0, 10)).toBeNull(); // the layer's width
    expect(drawReliefShapes("relief-missing", 0, 0, 10)).toBeNull();
    expect(drawReliefShapes("custom-1234abcd", 0, 0, 10)).toBeNull();
  });

  it("draws fills stretched unevenly, and art past an unclipped frame", () => {
    expect(
      drawReliefShapes(symbol('<path d="M0 0L10 10Z" transform="scale(1 0.5)" stroke="none"/>'), 0, 0, 10)
    ).not.toBeNull();
    const unclipped = symbol('<path d="M-5 0L5 5" stroke="none"/>', 'viewBox="0 0 10 10" overflow="visible"');
    expect(drawReliefShapes(unclipped, 0, 0, 10)).not.toBeNull();
  });

  it("never lets rounding drift along a long relative path", () => {
    const steps = Array.from({ length: 200 }, (_, i) => `L${(i % 10) + 0.333} ${((i * 7) % 10) + 0.333}`).join("");
    const id = symbol(`<path d="M0.333 0.333${steps}" stroke="none"/>`, 'viewBox="0 0 10 10" overflow="visible"');
    const markup = drawReliefShapes(id, 1234.567, 890.123, 7.77)!;
    const d = markup.match(/ d="([^"]+)"/)![1];
    const points = absolute(d);
    const last = points.at(-1)!;
    expect(last[0]).toBeCloseTo(1234.567 + ((199 % 10) + 0.333) * 0.777, 1);
    expect(last[1]).toBeCloseTo(890.123 + (((199 * 7) % 10) + 0.333) * 0.777, 1);
  });
});
