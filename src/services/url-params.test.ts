// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getRequestedMapSize } from "./map-size";
import { isMapLink } from "./url-params";

describe("getRequestedMapSize", () => {
  it("leaves missing dimensions unresolved", () => {
    expect(getRequestedMapSize(new URLSearchParams("seed=test"))).toEqual({ width: undefined, height: undefined });
  });

  it("takes positive dimensions from a shared-map URL", () => {
    expect(getRequestedMapSize(new URLSearchParams("width=900&height=600"))).toEqual({ width: 900, height: 600 });
  });

  it("ignores dimensions that cannot produce a graph", () => {
    expect(getRequestedMapSize(new URLSearchParams("width=0&height=invalid"))).toEqual({
      width: undefined,
      height: undefined
    });
  });
});

describe("isMapLink", () => {
  it("accepts http(s) links, also percent-encoded", () => {
    expect(isMapLink("https://dl.dropboxusercontent.com/s/abc/map.map")).toBe(true);
    expect(isMapLink("http://localhost:8000/map.map")).toBe(true);
    expect(isMapLink("https%3A%2F%2Fexample.com%2Fmap.map")).toBe(true);
  });

  it("rejects anything that is not a whole http(s) URL", () => {
    for (const maplink of [
      "",
      "map.map",
      "javascript:alert(1)",
      "data:text/plain,x",
      'x"><img src=x> https://example.com',
      "ftp://example.com/map.map",
      "https%3A%2F%2Fexample.com%2F%E0%A4%A"
    ]) {
      expect(isMapLink(maplink), maplink).toBe(false);
    }
  });
});
