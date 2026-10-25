import { describe, expect, it } from "vitest";
import { groupYear, kmOf, personYear, wrappedOpen, wrappedOpensAt, worldLaps, type WSpot } from "../../src/lib/wrapped";

const T = (iso: string) => Date.parse(iso);
const spot = (id: string, who: string[], at: string, over: Partial<WSpot> = {}): WSpot => ({
  id, lat: -34.9061, lng: -56.1993, at: T(at), types: ["papa"], placers: who, countryCode: "uy", country: "Uruguay", place: "Montevideo", life: undefined, diedAt: null, ...over,
});

const NOW = T("2026-12-05T12:00:00Z");
const spots: WSpot[] = [
  spot("1", ["Ana"], "2025-06-01T10:00:00Z"),                                                   // before: Uruguay is old for Ana
  spot("2", ["Ana"], "2026-01-10T10:00:00Z", { types: ["sexo-punto"], lat: 40.4168, lng: -3.7038, countryCode: "es", country: "España", place: "Madrid" }),
  spot("3", ["Ana"], "2026-03-02T10:00:00Z", { types: ["sexo-punto", "papa"], lat: 37.5665, lng: 126.978, countryCode: "kr", country: "Corea del Sur", place: "Seúl" }),
  spot("4", ["Ana"], "2026-03-20T10:00:00Z", { types: ["sexo-punto"], life: "dead", diedAt: T("2026-06-01T00:00:00Z") }),
  spot("5", ["Beto"], "2026-04-01T10:00:00Z"),
  spot("6", ["Beto", "Ana"], "2026-05-01T10:00:00Z", { life: "unknown" }),
  spot("7", ["Caro"], "2026-05-03T10:00:00Z"),
];

describe("kmOf", () => {
  it("sums consecutive hops in date order", () => {
    const a = spot("a", ["x"], "2026-01-01T00:00:00Z", { lat: 0, lng: 0 });
    const b = spot("b", ["x"], "2026-01-02T00:00:00Z", { lat: 0, lng: 1 });
    expect(kmOf([b, a])).toBeCloseTo(111.2, 0);
    expect(kmOf([a])).toBe(0);
  });
});

describe("personYear", () => {
  const ana = personYear(spots, "ana", 2026, NOW);

  it("counts only what the person stuck that year", () => {
    expect(ana.placed.map((s) => s.id)).toEqual(["2", "3", "4", "6"]);
  });
  it("finds the countries that are new that year", () => {
    expect(ana.countries.sort()).toEqual(["es", "kr", "uy"]);
    expect(ana.newCountries.map((c) => c.code).sort()).toEqual(["es", "kr"]);
    expect(ana.newCountries.find((c) => c.code === "kr")?.name).toBe("Corea del Sur");
  });
  it("picks the favourite type and the farthest sticker from Montevideo", () => {
    expect(ana.favorite).toEqual({ slug: "sexo-punto", count: 3 });
    expect(ana.farthest?.spot.id).toBe("3");
    expect(ana.farthest!.km).toBeGreaterThan(19_000);
    expect(ana.farthest!.km).toBeLessThan(20_000);
  });
  it("sums the km between consecutive placements", () => {
    expect(ana.km).toBeGreaterThan(20_000);
  });
  it("finds the sticker that lasted longest: gone ones until they died, living ones until today", () => {
    expect(ana.longest?.spot.id).toBe("2");
    expect(ana.longest?.alive).toBe(true);
    expect(ana.longest?.days).toBe(Math.floor((NOW - T("2026-01-10T10:00:00Z")) / 86_400_000));
    const dead = personYear([spot("d", ["Zoe"], "2026-01-01T00:00:00Z", { life: "dead", diedAt: T("2026-01-11T00:00:00Z") })], "Zoe", 2026, NOW);
    expect(dead.longest).toMatchObject({ days: 10, alive: false });
  });
  it("ranks among everyone who stuck something that year, with the rival above", () => {
    expect(ana.rank).toBe(1);
    expect(ana.people).toBe(3);
    expect(ana.rival).toBeNull();
    const beto = personYear(spots, "Beto", 2026, NOW);
    expect(beto.rank).toBe(2);
    expect(beto.rival).toEqual({ name: "Ana", gap: 2 });
  });
  it("is calm about someone with nothing that year", () => {
    const nobody = personYear(spots, "Nadie", 2026, NOW);
    expect(nobody.placed).toEqual([]);
    expect(nobody.favorite).toBeNull();
    expect(nobody.farthest).toBeNull();
    expect(nobody.longest).toBeNull();
    expect(nobody.rank).toBe(4);
  });
});

describe("groupYear", () => {
  it("summarises the year for everyone", () => {
    const g = groupYear(spots, 2026);
    expect(g.total).toBe(6);
    expect(g.countries).toBe(3);
    expect(g.newCountries.map((c) => c.code).sort()).toEqual(["es", "kr"]);
    expect(g.mvp).toEqual({ name: "Ana", count: 4 });
    expect(g.bestMonth).toEqual({ month: 2, count: 2 }); // March and May tie: the earlier month wins
    expect(g.fallen.map((s) => s.id)).toEqual(["4"]);
  });
});

describe("when Wrapped opens", () => {
  it("opens on 1 December of its year, earlier with the preview", () => {
    expect(wrappedOpensAt(2026)).toBe(Date.UTC(2026, 11, 1));
    expect(wrappedOpen(2026, Date.UTC(2026, 10, 30))).toBe(false);
    expect(wrappedOpen(2026, Date.UTC(2026, 11, 1))).toBe(true);
    expect(wrappedOpen(2026, Date.UTC(2026, 5, 1), true)).toBe(true);
  });
  it("turns km into laps around the world", () => {
    expect(worldLaps(40_075)).toBe(1);
    expect(worldLaps(23_900)).toBe(0.6);
  });
});
