import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterParams, hasActiveFilters, restorePatch, type AdminSpot } from "../../src/admin/api";
import { matchShortcut } from "../../src/admin/shortcuts";
import { formatBytes, groupCounts, parseCoords, slugify } from "../../src/admin/text";

describe("filterParams", () => {
  it("emits only the active filters so the list and the exports agree", () => {
    expect(filterParams(EMPTY_FILTERS).toString()).toBe("sort=created_at&dir=desc");
    const p = filterParams({ ...EMPTY_FILTERS, status: "queue", placerUnknown: true, batch: "any", q: "  madrid ", type: "papa" });
    expect(p.get("status")).toBe("queue");
    expect(p.get("placer")).toBe("unknown");
    expect(p.get("batch")).toBe("any");
    expect(p.get("q")).toBe("madrid");
    expect(p.get("type")).toBe("papa");
    expect(p.has("reason")).toBe(false);
  });

  it("knows when something narrows the list", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: "place", dir: "asc" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, placerUnknown: true })).toBe(true);
  });
});

describe("restorePatch", () => {
  it("puts moderation fields back exactly", () => {
    const prev = { status: "published", needs_review: true, review_reasons: ["a", "b"] } as AdminSpot;
    expect(restorePatch(prev)).toEqual({ status: "published", needs_review: true, review_reason: "a,b" });
    expect(restorePatch({ ...prev, needs_review: false, review_reasons: [] }).review_reason).toBeNull();
  });
});

describe("shortcuts", () => {
  it("fires on plain letters and ignores modified keys", () => {
    expect(matchShortcut({ key: "a" })).toBe("a");
    expect(matchShortcut({ key: "A" })).toBe("a");
    expect(matchShortcut({ key: "?" })).toBe("?");
    expect(matchShortcut({ key: "/" })).toBe("/");
    expect(matchShortcut({ key: "a", metaKey: true })).toBeNull();
    expect(matchShortcut({ key: "x" })).toBeNull();
    expect(matchShortcut({ key: "Enter" })).toBeNull();
  });

  it("ignores them while typing", () => {
    expect(matchShortcut({ key: "a", target: { tagName: "INPUT" } })).toBeNull();
    expect(matchShortcut({ key: "a", target: { tagName: "textarea" } })).toBeNull();
    expect(matchShortcut({ key: "b", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
    expect(matchShortcut({ key: "j", target: { tagName: "DIV", getAttribute: () => "combobox" } })).toBeNull();
    expect(matchShortcut({ key: "j", target: { tagName: "BUTTON", getAttribute: () => null } })).toBe("j");
  });
});

describe("util", () => {
  it("formats bytes with a decimal comma", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(76_835_292)).toBe("73,3 MB");
    expect(formatBytes(10 * 1024 ** 3)).toBe("10 GB");
  });

  it("slugifies labels", () => {
    expect(slugify("Sexo? OG")).toBe("sexo-og");
    expect(slugify("  Vaca Lechera ")).toBe("vaca-lechera");
    expect(slugify("Ñandú")).toBe("nandu");
  });

  it("parses coordinates", () => {
    expect(parseCoords("-34.9061, -56.1993")).toEqual({ lat: -34.9061, lng: -56.1993 });
    expect(parseCoords("40.4 -3.7")).toEqual({ lat: 40.4, lng: -3.7 });
    expect(parseCoords("95, 10")).toBeNull();
    expect(parseCoords("hola")).toBeNull();
  });

  it("groups free-text values ignoring case", () => {
    expect(groupCounts(["vaca", "Vaca", "vaca", "vaca", "", "perro", " Perro ", "Perro"])).toEqual([
      { text: "vaca", count: 4 },
      { text: "Perro", count: 3 },
    ]);
  });
});
