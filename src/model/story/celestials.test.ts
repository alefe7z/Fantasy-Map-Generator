// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Options } from "@/model/options/options-model";
import { Names } from "@/model/society/names-generator";
import { migrateLegacySettings } from "@/services/io/auto-update";
import { Celestials } from "./celestials";

beforeEach(() => {
  options = Options.getDefaultOptions();
  vi.spyOn(Names, "getMapName").mockReturnValue("Aelor");
});

describe("celestials", () => {
  it("adds suns and moons with ids and valid traits", () => {
    const sun = Celestials.add("sun", "Solis");
    const moon = Celestials.add("moon");

    expect(options.map.lore.celestials).toHaveLength(2);
    expect([sun.i, moon.i]).toEqual([0, 1]);
    expect(moon.name).toBe("Aelor");
    for (const body of [sun, moon]) {
      expect(body.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(body.size).toBeGreaterThan(0);
      expect(body.period).toBeGreaterThan(0);
    }
  });

  it("updates checked fields and rejects bad values", () => {
    const { i } = Celestials.add("moon", "Pale");
    Celestials.update(i, { name: "Red Eye", color: "#b04a3a", size: 2.345, period: 40, type: "sun" });
    expect(Celestials.get(i)).toMatchObject({ name: "Red Eye", color: "#b04a3a", size: 2.35, period: 40, type: "sun" });

    expect(() => Celestials.update(i, { size: 0 })).toThrow();
    expect(() => Celestials.update(i, { name: " " })).toThrow();
    expect(() => Celestials.update(i, { color: "red" })).toThrow();
  });

  it("removes a body", () => {
    const { i } = Celestials.add("sun", "One");
    Celestials.add("moon", "Two");
    Celestials.remove(i);
    expect(Celestials.all.map(body => body.name)).toEqual(["Two"]);
  });

  it("rolls a random sky with at least one sun", () => {
    Celestials.add("moon", "Old");
    Celestials.randomize();
    expect(Celestials.all.some(body => body.type === "sun")).toBe(true);
    expect(Celestials.all.some(body => body.name === "Old")).toBe(false);
  });

  it("gives a map saved before the manager an empty sky", () => {
    const settings = Options.getDefaultOptions().map as unknown as { lore: Record<string, unknown> };
    delete settings.lore.celestials;
    const data = ["", JSON.stringify(settings)];

    migrateLegacySettings("1.156.0", data);
    expect(JSON.parse(data[1]).lore.celestials).toEqual([]);
  });

  it("keeps the sky of a map that has one", () => {
    const settings = Options.getDefaultOptions().map;
    settings.lore.celestials = [
      { i: 0, type: "sun", name: "Solis", color: "#ffd75e", size: 1, period: 365, description: "" }
    ];
    const data = ["", JSON.stringify(settings)];

    migrateLegacySettings("1.156.0", data);
    expect(JSON.parse(data[1]).lore.celestials).toEqual(settings.lore.celestials);
  });
});
