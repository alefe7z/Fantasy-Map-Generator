// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/model/options/options-model";
import { Names } from "@/model/society/names-generator";
import { neutralizeLoadedText, neutralizeNote, neutralizeText } from "./loaded-text";

const HOSTILE = '"><img src=x onerror=alert(1)>';

beforeEach(() => {
  options = Options.getDefaultOptions();
  Names.nameBases = [{ name: `Base${HOSTILE}`, i: 0, min: 3, max: 9, d: "", m: 0, b: `Ana,Bo${HOSTILE}` }];
  globalThis.pack = {
    cells: { i: [0], h: new Uint8Array([30]) },
    vertices: { p: [] },
    features: [0, { i: 1, name: `Isle${HOSTILE}`, type: "island" }],
    burgs: [
      { i: 0 },
      { i: 1, name: `Town${HOSTILE}`, link: "javascript:alert(1)", coa: { t1: "or", charges: [{ charge: HOSTILE }] } },
      { i: 2, name: "Port", link: "https://example.com/map.png", note: "<p><b>Old</b> port</p>" }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Orwin", diplomacy: ["x", HOSTILE], note: `<img src=x onerror=alert(1)>Hi` }
    ],
    goods: [{ i: 1, name: "Fish", distribution: 'type("ocean") && shore(-1)' }]
  } as unknown as typeof pack;
});

describe("neutralizeText", () => {
  it("swaps the characters that open markup for lookalikes", () => {
    expect(neutralizeText('The "Old" <Road>')).toBe("The ”Old” ‹Road›");
    expect(neutralizeText("Ka'thar & Sons")).toBe("Ka'thar & Sons");
  });
});

describe("neutralizeNote", () => {
  it("keeps a note of the notes subset and reduces anything else to its text", () => {
    expect(neutralizeNote('<p>A <a href="https://example.com">link</a></p>')).toBe(
      '<p>A <a href="https://example.com">link</a></p>'
    );
    expect(neutralizeNote("<img src=x onerror=alert(1)>Hi <b>&lt;there&gt;</b>")).toBe("Hi &lt;there&gt;");
  });
});

describe("neutralizeLoadedText", () => {
  it("cleans names, nested values, notes, links and name bases, and leaves formulas alone", () => {
    neutralizeLoadedText();

    const [, town, port] = pack.burgs;
    expect(town.name).toBe("Town”›‹img src=x onerror=alert(1)›");
    expect(town.link).toBeUndefined();
    expect(JSON.stringify(town.coa)).not.toMatch(/[<>]/);
    expect(port.link).toBe("https://example.com/map.png");
    expect(port.note).toBe("<p><b>Old</b> port</p>");

    const [, orwin] = pack.states;
    expect(orwin.diplomacy?.[1]).not.toMatch(/["<>]/);
    expect(orwin.note).toBe("Hi");
    expect((pack.features[1] as { name: string }).name).not.toMatch(/["<>]/);
    expect(pack.goods[0].distribution).toBe('type("ocean") && shore(-1)');
    expect(Names.nameBases[0].name).not.toMatch(/["<>]/);
    expect(Names.nameBases[0].b).toBe("Ana,Bo”›‹img src=x onerror=alert(1)›");
  });

  it("cleans the map settings but keeps custom icon markup for the svg sanitizer", () => {
    options.map.lore.name = `World${HOSTILE}`;
    options.map.customIcons = [{ id: "custom-a", kind: "svg", content: "<path d='M0 0'/>", viewBox: "0 0 10 10" }];

    neutralizeLoadedText();

    expect(options.map.lore.name).not.toMatch(/["<>]/);
    expect(options.map.customIcons[0].content).toBe("<path d='M0 0'/>");
  });
});
