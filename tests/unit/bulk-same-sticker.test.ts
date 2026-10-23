import { describe, expect, it } from "vitest";
import { findSameGroups, nearestInTime, type TimedPoint } from "../../src/add/bulk/same-sticker";

const at = (id: string, lat: number, lng: number, takenAt: string | null): TimedPoint => ({ id, lat, lng, takenAt });
// 0.0001 degrees of latitude is about 11 m.
const A = at("a", -34.9, -56.16, "2024-05-01T10:00:00");

describe("findSameGroups", () => {
  it("groups two shots within 15 m and 30 min", () => {
    const groups = findSameGroups([A, at("b", -34.90005, -56.16, "2024-05-01T10:02:00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.ids).toEqual(["a", "b"]);
    expect(groups[0]?.minutes).toBe(2);
    expect(groups[0]?.meters).toBeLessThanOrEqual(15);
  });

  it("does not group photos further than 15 m", () => {
    expect(findSameGroups([A, at("b", -34.9002, -56.16, "2024-05-01T10:01:00")])).toEqual([]);
  });

  it("does not group photos further apart in time than 30 min", () => {
    expect(findSameGroups([A, at("b", -34.9, -56.16, "2024-05-01T10:31:00")])).toEqual([]);
  });

  it("includes the exact limits", () => {
    expect(findSameGroups([A, at("b", -34.9, -56.16, "2024-05-01T10:30:00")])).toHaveLength(1);
  });

  it("chains A~B and B~C into one group of three", () => {
    const groups = findSameGroups([A, at("b", -34.90012, -56.16, "2024-05-01T10:20:00"), at("c", -34.90024, -56.16, "2024-05-01T10:40:00")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.ids).toEqual(["a", "b", "c"]);
  });

  it("ignores photos without a date and gives the same key whatever the input order", () => {
    const b = at("b", -34.9, -56.16, "2024-05-01T10:05:00");
    expect(findSameGroups([A, at("n", -34.9, -56.16, null)])).toEqual([]);
    expect(findSameGroups([A, b])[0]?.key).toBe(findSameGroups([b, A])[0]?.key);
  });

  it("keeps separate groups apart", () => {
    const groups = findSameGroups([A, at("b", -34.9, -56.16, "2024-05-01T10:01:00"), at("c", 40.4, -3.7, "2024-05-01T10:02:00"), at("d", 40.4, -3.7, "2024-05-01T10:03:00")]);
    expect(groups.map((g) => g.ids)).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("nearestInTime", () => {
  const located = [at("early", 1, 1, "2024-05-01T09:00:00"), at("mid", 2, 2, "2024-05-01T10:42:00"), at("late", 3, 3, "2024-05-01T18:00:00")];

  it("picks the located photo closest in time", () => {
    expect(nearestInTime("2024-05-01T10:30:00", located)?.id).toBe("mid");
    expect(nearestInTime("2024-05-01T23:00:00", located)?.id).toBe("late");
  });

  it("goes to the earlier photo on a tie", () => {
    expect(nearestInTime("2024-05-01T10:00:00", [at("x", 1, 1, "2024-05-01T09:00:00"), at("y", 2, 2, "2024-05-01T11:00:00")])?.id).toBe("x");
  });

  it("has no suggestion without a date or without candidates", () => {
    expect(nearestInTime(null, located)).toBeNull();
    expect(nearestInTime("2024-05-01T10:30:00", [])).toBeNull();
    expect(nearestInTime("2024-05-01T10:30:00", [at("n", 1, 1, null)])).toBeNull();
  });
});
