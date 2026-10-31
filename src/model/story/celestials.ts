// The world's suns and moons in `options.map.lore.celestials`, carried in the .map file and kept through regeneration
import { Options } from "@/model/options/options-model";
import { CELESTIAL_TYPES, type OptionsData } from "@/model/options/options-schema";
import { Names } from "@/model/society/names-generator";
import { rn } from "@/utils/number-utils";
import { gauss, P, ra, rand } from "@/utils/probability-utils";
import { requireName, requireOneOf } from "@/utils/validation-utils";

export type Celestial = OptionsData["map"]["lore"]["celestials"][number];
export type CelestialType = Celestial["type"];

const COLORS: Record<CelestialType, string[]> = {
  sun: ["#ffd75e", "#ffb347", "#ff7a3d", "#ff4f3a", "#fff4d6", "#bfe3ff", "#8fb8ff"],
  moon: ["#d9dce3", "#c9b38a", "#e8c8a0", "#b04a3a", "#9fb8d6", "#a7d6a0", "#c7a6e0"]
};

const roll = {
  size: (type: CelestialType) => (type === "sun" ? gauss(1, 0.4, 0.2, 3, 1) : gauss(1, 0.5, 0.2, 4, 1)),
  period: (type: CelestialType) => (type === "sun" ? rand(300, 450) : gauss(28, 12, 5, 90, 1))
};

const requirePositive = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
  return value;
};

const requireColor = (value: unknown): string => {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error("The color must be #rrggbb");
  return value;
};

class CelestialsModel {
  get all(): Celestial[] {
    return options.map.lore.celestials;
  }

  get(id: number): Celestial | undefined {
    return this.all.find(body => body.i === id);
  }

  /** Add a sun or moon with rolled traits; returns it so the caller can select it */
  add(type: CelestialType, name?: string): Celestial {
    requireOneOf(type, CELESTIAL_TYPES, "The type");
    const body: Celestial = {
      i: this.all.length ? Math.max(...this.all.map(body => body.i)) + 1 : 0,
      type,
      name: name === undefined ? this.rollName(type) : requireName(name),
      color: ra(COLORS[type]),
      size: roll.size(type),
      period: roll.period(type),
      description: ""
    };
    this.all.push(body);
    Options.save();
    return body;
  }

  /** Change one body; the fields given are checked and the rest stay */
  update(id: number, change: Partial<Omit<Celestial, "i">>): void {
    const body = this.get(id);
    if (!body) throw new Error(`No celestial body ${id}`);

    if (change.type !== undefined) body.type = requireOneOf(change.type, CELESTIAL_TYPES, "The type");
    if (change.name !== undefined) body.name = requireName(change.name);
    if (change.color !== undefined) body.color = requireColor(change.color);
    if (change.size !== undefined) body.size = rn(requirePositive(change.size, "The size"), 2);
    if (change.period !== undefined) body.period = rn(requirePositive(change.period, "The period"), 2);
    if (change.description !== undefined) body.description = String(change.description);
    Options.save();
  }

  remove(id: number): void {
    options.map.lore.celestials = this.all.filter(body => body.i !== id);
    Options.save();
  }

  /** Replace the sky with a random one: usually one sun, sometimes two or three, and up to four moons */
  randomize(): void {
    options.map.lore.celestials = [];
    const suns = P(0.04) ? 3 : P(0.15) ? 2 : 1;
    for (let n = 0; n < suns; n++) this.add("sun");
    const moons = rand(0, 4);
    for (let n = 0; n < moons; n++) this.add("moon");
  }

  private rollName(type: CelestialType): string {
    const name = Names.getMapName();
    if (name) return name;
    return type === "sun" ? "Sun" : "Moon";
  }
}

export const Celestials = new CelestialsModel();
