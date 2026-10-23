import { describe, expect, it } from "vitest";
import { parseNominatim, parsePhoton } from "../../src/add/geocode";

describe("Photon results", () => {
  it("builds a short label and reads lng,lat from GeoJSON order", () => {
    const places = parsePhoton({
      features: [
        { geometry: { coordinates: [-56.1993, -34.9059] }, properties: { osm_type: "W", osm_id: 1, name: "Plaza Independencia", city: "Montevideo", country: "Uruguay", osm_value: "square" } },
        { geometry: { coordinates: [-56.16, -34.9] }, properties: { osm_type: "N", osm_id: 2, street: "Rondeau", housenumber: "1500", district: "Centro", country: "Uruguay", type: "house" } },
        { geometry: { coordinates: [-56, -33] }, properties: { osm_type: "R", osm_id: 3, name: "Uruguay", country: "Uruguay", type: "country" } },
      ],
    });
    expect(places).toHaveLength(3);
    expect(places[0]).toMatchObject({ label: "Plaza Independencia, Montevideo, Uruguay", lat: -34.9059, lng: -56.1993, zoom: 17 });
    expect(places[1]).toMatchObject({ label: "Rondeau 1500, Centro, Uruguay" });
    expect(places[2]).toMatchObject({ label: "Uruguay", zoom: 5 });
    expect(new Set(places.map((p) => p.id)).size).toBe(3);
  });

  it("skips features without coordinates or a name, and survives garbage", () => {
    expect(parsePhoton({ features: [{ geometry: { coordinates: [] }, properties: { name: "x" } }, { geometry: { coordinates: [1, 2] }, properties: {} }] })).toEqual([]);
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ lang: [{ message: "Language is not supported" }] })).toEqual([]);
  });
});

describe("Nominatim results", () => {
  it("shortens display_name and reads string lat/lon", () => {
    const places = parseNominatim([
      { place_id: 7, lat: "-34.9059", lon: "-56.1993", display_name: "Plaza Independencia, Ciudad Vieja, Montevideo, Departamento de Montevideo, 11000, Uruguay", addresstype: "square" },
      { place_id: 8, lat: "x", lon: "1", display_name: "Broken" },
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ label: "Plaza Independencia, Ciudad Vieja, Uruguay", lat: -34.9059, lng: -56.1993 });
  });

  it("returns nothing for a non-array", () => {
    expect(parseNominatim({ error: "boom" })).toEqual([]);
  });
});
