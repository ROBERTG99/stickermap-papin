import { describe, expect, it } from "vitest";
import { ageDays, computeLife, countedSightings, placedAtOf, survivalDays, type SightingLite } from "../../src/shared/life";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const sighting = (status: SightingLite["status"], daysAgo: number, review: SightingLite["review"] = "auto", by: string | null = null): SightingLite => ({ status, created_at: day(daysAgo), review, by });

describe("computeLife: no sightings", () => {
  it("is alive for its first 12 months", () => {
    expect(computeLife(day(200), [], NOW)).toEqual({ status: "alive", lastSeenAt: null, diedAt: null, count: 0 });
  });
  it("is unknown after that", () => {
    expect(computeLife(day(400), [], NOW).status).toBe("unknown");
  });
});

describe("computeLife: the last counted sighting decides", () => {
  it("alive and damaged keep it alive and set last seen", () => {
    const life = computeLife(day(900), [sighting("alive", 100), sighting("damaged", 20)], NOW);
    expect(life).toEqual({ status: "alive", lastSeenAt: day(20), diedAt: null, count: 2 });
  });
  it("covered or removed means dead, dated by that sighting", () => {
    const life = computeLife(day(900), [sighting("alive", 100), sighting("covered", 30)], NOW);
    expect(life).toMatchObject({ status: "dead", diedAt: day(30), lastSeenAt: day(100) });
    expect(computeLife(day(50), [sighting("removed", 5)], NOW).status).toBe("dead");
  });
  it("a later sighting that finds it standing brings it back", () => {
    const life = computeLife(day(900), [sighting("removed", 60), sighting("alive", 3)], NOW);
    expect(life).toMatchObject({ status: "alive", diedAt: null, lastSeenAt: day(3) });
  });
  it("goes to unknown when the last good news is over a year old", () => {
    expect(computeLife(day(900), [sighting("alive", 400)], NOW).status).toBe("unknown");
    expect(computeLife(day(900), [sighting("alive", 360)], NOW).status).toBe("alive");
  });
  it("ignores the order the sightings come in", () => {
    const a = computeLife(day(900), [sighting("covered", 30), sighting("alive", 100)], NOW);
    const b = computeLife(day(900), [sighting("alive", 100), sighting("covered", 30)], NOW);
    expect(a).toEqual(b);
  });
});

describe("unverified sightings", () => {
  it("do not change the status while they are alone", () => {
    const life = computeLife(day(100), [sighting("removed", 10, "pending")], NOW);
    expect(life).toMatchObject({ status: "alive", diedAt: null, count: 1 });
  });
  it("count once an admin approves them", () => {
    expect(computeLife(day(100), [sighting("removed", 10, "approved")], NOW).status).toBe("dead");
  });
  it("count when a second sighting from someone else agrees", () => {
    const life = computeLife(day(100), [sighting("covered", 10, "pending", "ip-a"), sighting("removed", 4, "pending", "ip-b")], NOW);
    expect(life.status).toBe("dead");
    expect(countedSightings([sighting("covered", 10, "pending", "ip-a"), sighting("alive", 4, "pending", "ip-b")])).toEqual([]);
  });
  it("do not corroborate themselves: the same sender twice is still one voice", () => {
    expect(computeLife(day(100), [sighting("covered", 10, "pending", "ip-a"), sighting("removed", 4, "pending", "ip-a")], NOW).status).toBe("alive");
    expect(computeLife(day(100), [sighting("covered", 10, "pending"), sighting("removed", 4, "pending")], NOW).status).toBe("alive");
  });
  it("never count by agreement while spots wait for approval", () => {
    const two = [sighting("covered", 10, "pending", "ip-a"), sighting("removed", 4, "pending", "ip-b")];
    expect(computeLife(day(100), two, NOW, true).status).toBe("alive");
    expect(computeLife(day(100), [...two.map((s) => ({ ...s, review: "approved" as const }))], NOW, true).status).toBe("dead");
  });
  it("never count when rejected, and are not in the total", () => {
    const life = computeLife(day(100), [sighting("removed", 10, "rejected"), sighting("alive", 5)], NOW);
    expect(life).toMatchObject({ status: "alive", count: 1 });
  });
});

describe("survival", () => {
  it("measures to the death, else the last sighting, else today", () => {
    expect(survivalDays(day(500), { diedAt: day(88), lastSeenAt: day(100) }, NOW)).toBe(412);
    expect(survivalDays(day(500), { diedAt: null, lastSeenAt: day(100) }, NOW)).toBe(400);
    expect(survivalDays(day(500), { diedAt: null, lastSeenAt: null }, NOW)).toBe(500);
    expect(ageDays(day(10), NOW)).toBe(10);
  });
  it("reads the naive taken_at as the placement date when there is one", () => {
    expect(placedAtOf("2025-04-15T10:00:00", "2026-01-01T00:00:00.000Z")).toBe("2025-04-15T10:00:00Z");
    expect(placedAtOf(null, "2026-01-01T00:00:00.000Z")).toBe("2026-01-01T00:00:00.000Z");
  });
});
