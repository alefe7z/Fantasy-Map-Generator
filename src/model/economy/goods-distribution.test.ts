import { describe, expect, it, vi } from "vitest";
import { compileDistribution } from "./goods-distribution";

const NAMES = ["biome", "minHeight", "river", "shore", "type", "random", "elevation"];

const methods = (overrides: Record<string, (...args: never[]) => unknown> = {}) => ({
  biome: (...ids: number[]) => ids.includes(6),
  minHeight: (height: number) => 50 >= height,
  river: () => 0,
  shore: (...rings: number[]) => rings.includes(-1),
  type: (...types: string[]) => types.includes("ocean"),
  random: () => true,
  elevation: () => true,
  ...overrides
});

const run = (expression: string, overrides?: Parameters<typeof methods>[0]) =>
  compileDistribution(expression, NAMES)(methods(overrides));

describe("compileDistribution", () => {
  it("evaluates the default catalogue's forms", () => {
    expect(run("biome(5, 6, 7)")).toBe(true);
    expect(run("minHeight(60) || (minHeight(30) && elevation())")).toBe(true);
    expect(run("river() && minHeight(40)")).toBe(false);
    expect(run('shore(-1) && (type("ocean", "freshwater") || river())')).toBe(true);
    expect(run("type('salt', 'dry')")).toBe(false);
    expect(run("!river() && !!biome(6)")).toBe(true);
    expect(run("minHeight(20.5)")).toBe(true);
  });

  it("short-circuits like JS, so random checks are drawn in the same order", () => {
    const random = vi.fn(() => true);
    run("biome(1) && random(50)", { random });
    expect(random).not.toHaveBeenCalled();
    run("biome(6) || random(50)", { random });
    expect(random).not.toHaveBeenCalled();
    run("biome(6) && random(50)", { random });
    expect(random).toHaveBeenCalledWith(50);
  });

  it("rejects anything that is not a built-in call", () => {
    for (const expression of [
      "alert(1)",
      "biome(1) && fetch('x')",
      "biome(1); biome(2)",
      "constructor.constructor('x')()",
      "biome(1) + 1",
      "biome(globalThis)",
      "biome[0]",
      "`x`",
      "biome(1",
      "biome(1))",
      "",
      "biome(1,)"
    ]) {
      expect(() => compileDistribution(expression, NAMES), expression).toThrow();
    }
  });

  it("names the problem and where it is", () => {
    expect(() => compileDistribution("biome(1) && alert(1)", NAMES)).toThrow('Unknown function "alert" at position 13');
    expect(() => compileDistribution("biome(1) | river()", NAMES)).toThrow('Unexpected "|" at position 10');
  });
});
