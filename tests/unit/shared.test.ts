import { describe, expect, it } from "vitest";
import { geocodeKey, haversineMeters, round3 } from "../../src/shared/geo";
import { createSpotMeta } from "../../src/shared/schema";
import { encodeUlid, newUlid } from "../../src/shared/ulid";
import { exifDateToNaive, validGps } from "../../src/lib/photo";
import { formatDate, formatKm, formatNaiveDate, formatNumber, formatRemaining, formatWhen } from "../../src/lib/format";

describe("geo", () => {
  it("measures great-circle distance", () => {
    // Montevideo -> Buenos Aires is about 205 km
    const d = haversineMeters(-34.9011, -56.1645, -34.6037, -58.3816);
    expect(d / 1000).toBeGreaterThan(200);
    expect(d / 1000).toBeLessThan(210);
    expect(haversineMeters(1, 1, 1, 1)).toBe(0);
  });
  it("rounds to ~100 m and builds a 3-decimal cache key", () => {
    expect(round3(-34.90717890299993)).toBe(-34.907);
    expect(geocodeKey(-34.90717, 56.1)).toBe("-34.907,56.100");
  });
});

describe("ulid", () => {
  it("is sortable by time and 26 chars of Crockford base32", () => {
    const a = encodeUlid(1_000, new Uint8Array(10));
    const b = encodeUlid(2_000, new Uint8Array(10));
    expect(a < b).toBe(true);
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it("encodes the known zero value", () => {
    expect(encodeUlid(0, new Uint8Array(10))).toBe("0".repeat(26));
  });
});

describe("photo helpers", () => {
  it("accepts only real GPS fixes", () => {
    expect(validGps(-34.9, -56.16)).toBe(true);
    expect(validGps(0, 0)).toBe(false);
    expect(validGps(91, 0)).toBe(false);
    expect(validGps(10, 181)).toBe(false);
    expect(validGps(undefined, 5)).toBe(false);
    expect(validGps(Number.NaN, 5)).toBe(false);
  });
  it("converts EXIF dates to naive ISO", () => {
    expect(exifDateToNaive("2023:08:02 10:31:01")).toBe("2023-08-02T10:31:01");
    expect(exifDateToNaive("garbage")).toBeNull();
    expect(exifDateToNaive(undefined)).toBeNull();
  });
});

describe("format (design voice)", () => {
  it("writes dates as 15 abr 2025 without 'de'", () => {
    expect(formatDate("2025-04-15T12:00:00Z")).toBe("15 abr 2025");
    expect(formatNaiveDate("2023-08-02T23:59:00")).toBe("2 ago 2023");
  });
  it("uses a dot for thousands and a comma for decimals", () => {
    expect(formatNumber(19609)).toBe("19.609");
    expect(formatNumber(12.4, 1)).toBe("12,4");
    expect(formatKm(19_609_000)).toBe("19.609 km");
    expect(formatKm(1500)).toBe("1,5 km");
  });
  it("is relative under 24 h only", () => {
    const now = Date.parse("2025-04-15T12:00:00Z");
    expect(formatWhen("2025-04-15T09:00:00Z", now)).toBe("hace 3 h");
    expect(formatWhen("2025-04-13T09:00:00Z", now)).toBe("13 abr 2025");
  });
  it("formats the edit window countdown", () => {
    expect(formatRemaining((23 * 60 + 12) * 60_000)).toBe("23 h 12 min");
    expect(formatRemaining(5 * 60_000)).toBe("5 min");
  });
});

describe("createSpotMeta", () => {
  const base = { lat: -34.9, lng: -56.16, location_source: "pin", types: ["papa"], placer_status: "unknown" } as const;
  it("accepts a minimal valid spot", () => {
    expect(createSpotMeta.safeParse(base).success).toBe(true);
  });
  it("requires a reporter for 'Yo' and names for 'Otro/s'", () => {
    expect(createSpotMeta.safeParse({ ...base, placer_status: "self" }).success).toBe(false);
    expect(createSpotMeta.safeParse({ ...base, placer_status: "self", reporter: "Ana" }).success).toBe(true);
    expect(createSpotMeta.safeParse({ ...base, placer_status: "other" }).success).toBe(false);
    expect(createSpotMeta.safeParse({ ...base, placer_status: "other", placers: ["Caro", "Beto"] }).success).toBe(true);
    expect(createSpotMeta.safeParse({ ...base, placers: ["Caro"] }).success).toBe(false);
  });
  it("rejects out-of-range coordinates, empty types and long texts", () => {
    expect(createSpotMeta.safeParse({ ...base, lat: 91 }).success).toBe(false);
    expect(createSpotMeta.safeParse({ ...base, types: [] }).success).toBe(false);
    expect(createSpotMeta.safeParse({ ...base, note: "x".repeat(281) }).success).toBe(false);
    expect(createSpotMeta.safeParse({ ...base, other_text: "x".repeat(41) }).success).toBe(false);
  });
});
