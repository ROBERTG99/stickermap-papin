import { describe, expect, it } from "vitest";
import { greatCircle, partialLine, routeKm, routeLine, stopsFor, unwrapLongitudes } from "../../src/map/routes";
import type { SpotFeature } from "../../src/shared/types";

const feature = (id: string, lng: number, lat: number, placers: string[], created: string, taken: string | null = null): SpotFeature => ({
  type: "Feature", id, geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { id, types: ["papa"], placers, placer_status: "self", reporter: placers[0] ?? null, place_name: null, country: null, country_code: null, taken_at: taken, created_at: created, thumb: null, photo: null, n: 1 },
});

describe("stopsFor", () => {
  it("lists a person's spots by photo date, falling back to the upload date, whatever the case of the name", () => {
    const features = [
      feature("B", 2, 2, ["Ana"], "2025-03-01T00:00:00.000Z"),
      feature("A", 1, 1, ["ana"], "2025-09-01T00:00:00.000Z", "2025-01-10T10:00:00"),
      feature("C", 3, 3, ["Beto"], "2025-02-01T00:00:00.000Z"),
    ];
    expect(stopsFor(features, "ANA").map((s) => s.id)).toEqual(["A", "B"]);
    expect(stopsFor(features, "nadie")).toEqual([]);
  });
});

describe("routeKm", () => {
  it("sums the great-circle hops", () => {
    const stops = [{ id: "1", lat: 0, lng: 0, at: 1 }, { id: "2", lat: 0, lng: 1, at: 2 }, { id: "3", lat: 1, lng: 1, at: 3 }];
    expect(routeKm(stops)).toBeCloseTo(222.4, 0);
    expect(routeKm([])).toBe(0);
  });
  it("Montevideo to Madrid is about 9,950 km", () => {
    const km = routeKm([{ id: "a", lat: -34.9061, lng: -56.1993, at: 1 }, { id: "b", lat: 40.4168, lng: -3.7038, at: 2 }]);
    expect(km).toBeGreaterThan(9_900);
    expect(km).toBeLessThan(10_000);
  });
});

describe("greatCircle", () => {
  it("keeps both ends exactly and bends towards the pole", () => {
    const line = greatCircle([-100, 40], [100, 40], 16);
    expect(line[0]).toEqual([-100, 40]);
    expect(line.at(-1)).toEqual([100, 40]);
    expect(Math.max(...line.map((p) => p[1]))).toBeGreaterThan(70); // the polar route is the short one
  });
  it("does not blow up for the same point", () => {
    expect(greatCircle([5, 5], [5, 5])).toEqual([[5, 5], [5, 5]]);
  });
});

describe("antimeridian", () => {
  it("unwraps longitudes so a hop across 180 stays short", () => {
    expect(unwrapLongitudes([[170, 0], [-170, 0], [-160, 0]])).toEqual([[170, 0], [190, 0], [200, 0]]);
    expect(unwrapLongitudes([[-170, 0], [170, 0]])).toEqual([[-170, 0], [-190, 0]]);
  });
  it("builds a polyline across it without a jump", () => {
    const line = routeLine([{ id: "a", lat: 0, lng: 175, at: 1 }, { id: "b", lat: 0, lng: -175, at: 2 }], 8);
    for (let i = 1; i < line.length; i++) expect(Math.abs(line[i]![0] - line[i - 1]![0])).toBeLessThan(5);
  });
});

describe("partialLine (the draw-in animation)", () => {
  const line: [number, number][] = [[0, 0], [10, 0], [20, 0]];
  it("returns the head of the line up to the interpolated point", () => {
    expect(partialLine(line, 0)).toEqual([[0, 0], [0, 0]]);
    expect(partialLine(line, 0.25)).toEqual([[0, 0], [5, 0]]);
    expect(partialLine(line, 0.75)).toEqual([[0, 0], [10, 0], [15, 0]]);
    expect(partialLine(line, 1)).toEqual(line);
  });
});
