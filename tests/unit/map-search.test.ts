import { describe, expect, it } from "vitest";
import { parsePhoton, photonUrl } from "../../src/map/search";

const madrid = {
  type: "Feature",
  properties: { osm_type: "R", osm_id: 5326784, name: "Madrid", state: "Comunidad de Madrid", country: "España", extent: [-3.88, 40.64, -3.51, 40.31] },
  geometry: { type: "Point", coordinates: [-3.7035, 40.4168] },
};

describe("photonUrl", () => {
  it("builds the request with a limit of 5 and no unsupported language", () => {
    const url = new URL(photonUrl("  Puerta del Sol "));
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.searchParams.get("q")).toBe("Puerta del Sol");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.has("lang")).toBe(false);
  });

  it("asks for English names in English only", () => {
    expect(new URL(photonUrl("madrid", "en")).searchParams.get("lang")).toBe("en");
  });
});

describe("parsePhoton", () => {
  it("reads the point, a readable detail line and a normalised bbox (west, south, east, north)", () => {
    const [r] = parsePhoton({ features: [madrid] });
    expect(r).toMatchObject({ name: "Madrid", detail: "Comunidad de Madrid, España", lng: -3.7035, lat: 40.4168 });
    expect(r?.bbox).toEqual([-3.88, 40.31, -3.51, 40.64]);
  });

  it("has no bbox for plain points", () => {
    const [r] = parsePhoton({ features: [{ ...madrid, properties: { ...madrid.properties, extent: undefined } }] });
    expect(r?.bbox).toBeNull();
  });

  it("skips features without coordinates or name and collapses duplicates", () => {
    const out = parsePhoton({ features: [{ properties: { name: "x" } }, { geometry: { coordinates: [1, 2] }, properties: {} }, madrid, madrid] });
    expect(out).toHaveLength(1);
  });

  it("survives garbage", () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: "no" })).toEqual([]);
  });
});
