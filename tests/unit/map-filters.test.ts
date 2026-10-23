import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_REPORTER,
  EMPTY_FILTERS,
  UNKNOWN_PLACER,
  activeFilterCount,
  applyFilters,
  computeBounds,
  facetCounts,
  listCountries,
  nearestSpots,
  stepSpot,
  toggleValue,
  type Filters,
} from "../../src/map/filters";
import type { PlacerStatus, SpotFeature } from "../../src/shared/types";

let seq = 0;
function spot(over: {
  id?: string;
  lng?: number;
  lat?: number;
  types?: string[];
  placers?: string[];
  placer_status?: PlacerStatus;
  reporter?: string | null;
  country_code?: string | null;
  country?: string | null;
  taken_at?: string | null;
  created_at?: string;
}): SpotFeature {
  const id = over.id ?? `S${String(++seq).padStart(3, "0")}`;
  const types = over.types ?? ["papa"];
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [over.lng ?? 0, over.lat ?? 0] },
    properties: {
      id,
      types,
      placers: over.placers ?? [],
      placer_status: over.placer_status ?? (over.placers?.length ? "other" : "unknown"),
      reporter: over.reporter === undefined ? "Ana" : over.reporter,
      place_name: null,
      country: over.country ?? "Uruguay",
      country_code: over.country_code === undefined ? "uy" : over.country_code,
      taken_at: over.taken_at ?? null,
      created_at: over.created_at ?? "2025-04-15T12:00:00.000Z",
      thumb: null,
      photo: null,
      n: types.length,
    },
  };
}

const NOW = Date.parse("2025-06-01T00:00:00Z");
const f = (over: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...over });

describe("applyFilters", () => {
  const spots = [
    spot({ id: "A", types: ["papa"], placers: ["Beto"], reporter: "Ana", country_code: "uy" }),
    spot({ id: "B", types: ["papa", "sexo-punto"], placers: ["Caro", "Beto"], reporter: "Beto", country_code: "es", country: "España" }),
    spot({ id: "C", types: ["otro"], placers: [], reporter: null, country_code: "ar", country: "Argentina", created_at: "2023-01-10T00:00:00.000Z" }),
  ];

  it("returns everything with no filter", () => {
    expect(applyFilters(spots, EMPTY_FILTERS, NOW).map((s) => s.id)).toEqual(["A", "B", "C"]);
  });

  it("matches ANY of the selected values inside a facet and ALL facets together", () => {
    expect(applyFilters(spots, f({ types: ["sexo-punto", "otro"] }), NOW).map((s) => s.id)).toEqual(["B", "C"]);
    expect(applyFilters(spots, f({ types: ["papa"], countries: ["es"] }), NOW).map((s) => s.id)).toEqual(["B"]);
  });

  it("matches a spot with several placers by any of them, and unknown placers by their own key", () => {
    expect(applyFilters(spots, f({ placers: ["Caro"] }), NOW).map((s) => s.id)).toEqual(["B"]);
    expect(applyFilters(spots, f({ placers: [UNKNOWN_PLACER] }), NOW).map((s) => s.id)).toEqual(["C"]);
  });

  it("matches anonymous reporters", () => {
    expect(applyFilters(spots, f({ reporters: [ANONYMOUS_REPORTER] }), NOW).map((s) => s.id)).toEqual(["C"]);
    expect(applyFilters(spots, f({ reporters: ["Ana", "Beto"] }), NOW).map((s) => s.id)).toEqual(["A", "B"]);
  });

  it("applies the date presets against taken_at, falling back to created_at", () => {
    expect(applyFilters(spots, f({ date: "month" }), NOW).map((s) => s.id)).toEqual([]);
    expect(applyFilters(spots, f({ date: "halfYear" }), NOW).map((s) => s.id)).toEqual(["A", "B"]);
    expect(applyFilters(spots, f({ date: "year" }), NOW).map((s) => s.id)).toEqual(["A", "B"]);
    const taken = [spot({ id: "T", taken_at: "2025-05-20T10:00:00", created_at: "2020-01-01T00:00:00.000Z" })];
    expect(applyFilters(taken, f({ date: "month" }), NOW)).toHaveLength(1);
  });

  it("yields an empty list when nothing matches", () => {
    expect(applyFilters(spots, f({ types: ["sexo-pregunta"] }), NOW)).toEqual([]);
  });
});

describe("facetCounts", () => {
  const spots = [
    spot({ id: "A", types: ["papa"], country_code: "uy" }),
    spot({ id: "B", types: ["papa", "otro"], country_code: "es", country: "España" }),
    spot({ id: "C", types: ["otro"], country_code: "es", country: "España" }),
    spot({ id: "D", types: ["sexo-punto"], country_code: "ar", country: "Argentina" }),
  ];

  it("counts each facet against the OTHER active filters, not its own", () => {
    const c = facetCounts(spots, f({ types: ["papa"], countries: ["es"] }), NOW);
    expect(c.total).toBe(1); // B only
    // types: counted with countries=es applied but not the type filter itself
    expect(Object.fromEntries(c.types)).toEqual({ papa: 1, otro: 2 });
    // countries: counted with types=papa applied but not the country filter itself
    expect(Object.fromEntries(c.countries)).toEqual({ uy: 1, es: 1 });
  });

  it("gives 0 (absent) to a chip that would empty the map", () => {
    const c = facetCounts(spots, f({ countries: ["uy"] }), NOW);
    expect(c.types.get("sexo-punto") ?? 0).toBe(0);
    expect(c.types.get("papa")).toBe(1);
  });

  it("counts a multi-type spot once per type and the total once", () => {
    const c = facetCounts(spots, EMPTY_FILTERS, NOW);
    expect(c.total).toBe(4);
    expect(c.types.get("papa")).toBe(2);
    expect(c.types.get("otro")).toBe(2);
  });

  it("counts the date presets against the other filters", () => {
    const dated = [spot({ created_at: "2025-05-25T00:00:00.000Z" }), spot({ created_at: "2025-01-01T00:00:00.000Z" }), spot({ created_at: "2020-01-01T00:00:00.000Z" })];
    const c = facetCounts(dated, EMPTY_FILTERS, NOW);
    expect(c.date).toEqual({ all: 3, month: 1, halfYear: 2, year: 2 });
  });
});

describe("filter helpers", () => {
  it("counts active facets, not chips", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount(f({ types: ["a", "b"], countries: ["es"], date: "year" }))).toBe(3);
  });

  it("toggles a value in a list", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("lists countries most common first", () => {
    const spots = [spot({ country_code: "es", country: "España" }), spot({ country_code: "uy" }), spot({ country_code: "es", country: "España" }), spot({ country_code: null })];
    expect(listCountries(spots)).toEqual([
      { code: "es", name: "España" },
      { code: "uy", name: "Uruguay" },
    ]);
  });
});

describe("computeBounds", () => {
  it("returns null without spots", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("wraps all points in [[west, south], [east, north]]", () => {
    const b = computeBounds([spot({ lng: -71.5, lat: -41.1 }), spot({ lng: 139.7, lat: 35.7 }), spot({ lng: -3.7, lat: 40.4 })]);
    expect(b).toEqual([[-71.5, -41.1], [139.7, 40.4]]);
  });

  it("gives a degenerate box for a single spot", () => {
    expect(computeBounds([spot({ lng: 1, lat: 2 })])).toEqual([[1, 2], [1, 2]]);
  });
});

describe("nearestSpots", () => {
  const origin = { id: "O", lng: -56.2, lat: -34.9 };
  const spots = [
    spot({ id: "O", lng: -56.2, lat: -34.9 }),
    spot({ id: "FAR", lng: 139.7, lat: 35.7 }),
    spot({ id: "NEAR", lng: -56.19, lat: -34.91 }),
    spot({ id: "MID", lng: -58.4, lat: -34.6 }), // Buenos Aires
  ];

  it("orders by distance from the origin and leaves the origin out", () => {
    expect(nearestSpots(origin, spots, 10).map((s) => s.id)).toEqual(["NEAR", "MID", "FAR"]);
  });

  it("respects the limit", () => {
    expect(nearestSpots(origin, spots, 1).map((s) => s.id)).toEqual(["NEAR"]);
  });

  it("breaks distance ties by id so the order is stable", () => {
    const twins = [spot({ id: "B", lng: 1, lat: 1 }), spot({ id: "A", lng: 1, lat: 1 })];
    expect(nearestSpots({ lng: 0, lat: 0 }, twins, 5).map((s) => s.id)).toEqual(["A", "B"]);
  });
});

describe("stepSpot", () => {
  const spots = [spot({ id: "02" }), spot({ id: "01" }), spot({ id: "03" })];
  it("walks the ids in order and wraps around", () => {
    expect(stepSpot(spots, "01", 1)).toBe("02");
    expect(stepSpot(spots, "03", 1)).toBe("01");
    expect(stepSpot(spots, "01", -1)).toBe("03");
  });
  it("has nowhere to go with fewer than two spots", () => {
    expect(stepSpot([spot({ id: "x" })], "x", 1)).toBeNull();
  });
});
