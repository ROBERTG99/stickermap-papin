import { describe, expect, it } from "vitest";
import { averageBy, survivalCurve } from "../../src/shared/survival";
import { bearingDegrees, compassName, haversineMeters } from "../../src/shared/geo";

describe("survivalCurve", () => {
  it("starts at 100% and drops when stickers die", () => {
    const items = [
      { days: 100, dead: true }, { days: 100, dead: false }, { days: 400, dead: false }, { days: 400, dead: false },
    ];
    const curve = survivalCurve(items, 60, 300);
    expect(curve[0]).toEqual({ day: 0, alive: 1 });
    expect(curve.find((p) => p.day === 60)?.alive).toBe(1);
    // one of the four at risk dies between day 60 and 120
    expect(curve.find((p) => p.day === 120)?.alive).toBe(0.75);
  });
  it("does not make up data beyond the longest observation", () => {
    const curve = survivalCurve([{ days: 70, dead: false }, { days: 10, dead: true }], 30, 720);
    expect(curve.at(-1)!.day).toBeLessThanOrEqual(60);
  });
  it("never goes up", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ days: 10 + i * 20, dead: i % 3 === 0 }));
    const curve = survivalCurve(items, 30, 600);
    for (let i = 1; i < curve.length; i++) expect(curve[i]!.alive).toBeLessThanOrEqual(curve[i - 1]!.alive);
  });
});

describe("averageBy", () => {
  it("averages per group, longest first, and honours the minimum", () => {
    const rows = averageBy([
      { key: "a", label: "Papa", days: 100 }, { key: "a", label: "Papa", days: 300 }, { key: "b", label: "Sexo.", days: 50 }, { key: "c", label: "Otro", days: 900 },
    ]);
    expect(rows.map((r) => [r.key, r.avg_days, r.count])).toEqual([["c", 900, 1], ["a", 200, 2], ["b", 50, 1]]);
    expect(averageBy([{ key: "a", label: "x", days: 5 }, { key: "a", label: "x", days: 7 }, { key: "b", label: "y", days: 1 }], 2).map((r) => r.key)).toEqual(["a"]);
  });
});

describe("bearing and compass", () => {
  it("points the right way", () => {
    expect(Math.round(bearingDegrees(0, 0, 1, 0))).toBe(0);
    expect(Math.round(bearingDegrees(0, 0, 0, 1))).toBe(90);
    expect(Math.round(bearingDegrees(0, 0, -1, 0))).toBe(180);
    expect(Math.round(bearingDegrees(0, 0, 0, -1))).toBe(270);
    expect(compassName(20)).toBe("n");
    expect(compassName(50)).toBe("ne");
    expect(compassName(359)).toBe("n");
    expect(compassName(-90)).toBe("w");
  });
  it("measures Montevideo block distances", () => {
    const m = haversineMeters(-34.9061, -56.1993, -34.9071, -56.1993);
    expect(m).toBeGreaterThan(100);
    expect(m).toBeLessThan(120);
  });
});
