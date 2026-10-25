import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flipStaleSpots, refreshLife } from "../../worker/lib/life";
import { bucket, call, db, MP4, mockTurnstile, resetState, spotForm, WEBP } from "./helpers";

beforeEach(async () => {
  await resetState();
  await db().batch([
    db().prepare("DELETE FROM sightings"),
    db().prepare("UPDATE settings SET value = 'on' WHERE key IN ('feature_sightings', 'feature_video')"),
  ]);
});
afterEach(() => vi.restoreAllMocks());

const SPOT = { lat: -34.9061, lng: -56.1993 };

async function newSpot(meta: Record<string, unknown> = {}) {
  mockTurnstile(true);
  const res = await call("/api/spots", { method: "POST", body: spotForm({ meta: { ...SPOT, reporter: "Ana", ...meta } }) });
  return ((await res.json()) as { id: string }).id;
}

function sightingForm(meta: Record<string, unknown>, files: { display?: Uint8Array; thumb?: Uint8Array; video?: Uint8Array } = {}) {
  const form = new FormData();
  form.set("meta", JSON.stringify({ turnstile_token: "tok", ...meta }));
  if (files.display) form.set("display", new File([files.display.slice().buffer], "d.webp", { type: "image/webp" }));
  if (files.thumb) form.set("thumb", new File([files.thumb.slice().buffer], "t.webp", { type: "image/webp" }));
  if (files.video) form.set("video", new File([files.video.slice().buffer], "v.mp4", { type: "video/mp4" }));
  return form;
}

/** `ip` stands for who is sending: two reports only corroborate each other when they come from different addresses. */
async function sight(spotId: string, meta: Record<string, unknown>, files?: Parameters<typeof sightingForm>[1], ip = "203.0.113.7") {
  mockTurnstile(true);
  const res = await call(`/api/spots/${spotId}/sightings`, { method: "POST", body: sightingForm(meta, files), headers: { "CF-Connecting-IP": ip } });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

const detail = async (id: string) => (await (await call(`/api/spots/${id}`)).json()) as { life_info: { status: string; died_at: string | null; count: number } };

describe("POST /api/spots/:id/sightings", () => {
  it("is refused while the feature is off", async () => {
    const id = await newSpot();
    await db().prepare("UPDATE settings SET value = 'off' WHERE key = 'feature_sightings'").run();
    const { res, body } = await sight(id, { status: "alive" });
    expect(res.status).toBe(403);
    expect(body.error).toBe("feature_off");
  });

  it("a standing report from within 300 m counts at once", async () => {
    const id = await newSpot();
    const { res, body } = await sight(id, { status: "damaged", lat: SPOT.lat + 0.0005, lng: SPOT.lng, reporter: "Beto" });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ verified: true, pending: false, life: "alive" });
    expect((await detail(id)).life_info).toMatchObject({ status: "alive", count: 1 });
  });

  it("a report that it is gone needs both proofs (nearby and a fresh photo) to count at once", async () => {
    const id = await newSpot();
    const near = { lat: SPOT.lat + 0.0005, lng: SPOT.lng };
    const nearOnly = await sight(id, { status: "removed", ...near });
    expect(nearOnly.body).toMatchObject({ verified: true, pending: true, life: "alive" });
    const fresh = new Date(Date.now() - 600_000).toISOString().slice(0, 19);
    const both = await sight(id, { status: "removed", ...near, taken_at: fresh }, { display: WEBP(), thumb: WEBP() }, "198.51.100.9");
    expect(both.body).toMatchObject({ verified: true, pending: false, life: "dead" });
    expect((await detail(id)).life_info).toMatchObject({ status: "dead", count: 2 });
    const list = (await (await call("/api/spots")).json()) as { features: { id: string; properties: { life?: string } }[] };
    expect(list.features.find((f) => f.id === id)?.properties.life).toBe("dead");
  });

  it("a far sighting without a photo waits: it shows as pending and changes nothing", async () => {
    const id = await newSpot();
    const { body } = await sight(id, { status: "covered", lat: SPOT.lat + 1, lng: SPOT.lng });
    expect(body).toMatchObject({ verified: false, pending: true, life: "alive" });
    const rows = (await (await call(`/api/spots/${id}/sightings`)).json()) as { status: string; pending: boolean; verified: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "covered", pending: true, verified: false });
    expect((await detail(id)).life_info.status).toBe("alive");
  });

  it("a second report from someone else that agrees makes it count; the same sender does not", async () => {
    const id = await newSpot();
    await sight(id, { status: "covered" });
    expect((await sight(id, { status: "removed" })).body.life).toBe("alive"); // same address: still one voice
    const other = await sight(id, { status: "removed" }, undefined, "198.51.100.77");
    expect(other.body.life).toBe("dead");
  });

  it("pictures of a pending report are not public until it counts", async () => {
    const id = await newSpot();
    const { body } = await sight(id, { status: "alive", taken_at: "2020-01-01T10:00:00" }, { display: WEBP(), thumb: WEBP() });
    expect(body.pending).toBe(true);
    const rows = (await (await call(`/api/spots/${id}/sightings`)).json()) as { thumb: string | null; pending: boolean }[];
    expect(rows[0]).toMatchObject({ pending: true, thumb: null });
    expect((await call(`/img/thumb/${body.id as string}.webp`)).status).toBe(404);
    await db().prepare("UPDATE sightings SET status_review = 'approved' WHERE id = ?1").bind(body.id).run();
    expect((await call(`/img/thumb/${body.id as string}.webp`)).status).toBe(200);
  });

  it("a fresh photo verifies a sighting made from far away", async () => {
    const id = await newSpot();
    const taken = new Date(Date.now() - 3_600_000).toISOString().slice(0, 19);
    const { body } = await sight(id, { status: "damaged", taken_at: taken }, { display: WEBP(), thumb: WEBP() });
    expect(body).toMatchObject({ verified: true, life: "alive" });
    const rows = (await (await call(`/api/spots/${id}/sightings`)).json()) as { thumb: string }[];
    expect(rows[0]!.thumb).toMatch(/^\/img\/thumb\//);
    expect((await call(rows[0]!.thumb)).status).toBe(200);
  });

  it("an old photo does not verify", async () => {
    const id = await newSpot();
    const { body } = await sight(id, { status: "alive", taken_at: "2020-01-01T10:00:00" }, { display: WEBP(), thumb: WEBP() });
    expect(body.verified).toBe(false);
  });

  it("takes a converted clip, never an untranscoded one", async () => {
    const id = await newSpot();
    const ok = await sight(id, { status: "alive", lat: SPOT.lat, lng: SPOT.lng }, { display: WEBP(), thumb: WEBP(), video: MP4() });
    expect(ok.res.status).toBe(201);
    const sightingId = ok.body.id as string;
    expect((await call(`/media/video/${sightingId}.mp4`)).status).toBe(200);
    expect((await sight(id, { status: "alive" }, { display: WEBP(), thumb: WEBP(), video: MP4(256, "qt  ") })).res.status).toBe(415);
    expect((await sight(id, { status: "alive" }, { video: MP4() })).res.status).toBe(400);
  });

  it("rejects an unknown spot, a hidden spot and a bad status", async () => {
    const id = await newSpot();
    expect((await sight("01HZZZZZZZZZZZZZZZZZZZZZZZ", { status: "alive" })).res.status).toBe(404);
    expect((await sight(id, { status: "gone" })).res.status).toBe(400);
    await db().prepare("UPDATE spots SET status = 'hidden' WHERE id = ?1").bind(id).run();
    expect((await sight(id, { status: "alive" })).res.status).toBe(404);
  });

  it("rate limits a flood from one address", async () => {
    const id = await newSpot();
    for (let i = 0; i < 20; i++) expect((await sight(id, { status: "alive" })).res.status).toBe(201);
    expect((await sight(id, { status: "alive" })).res.status).toBe(429);
  });

  it("a rejected sighting is hidden with its photo and no longer counts", async () => {
    const id = await newSpot();
    const fresh = new Date(Date.now() - 600_000).toISOString().slice(0, 19);
    const { body } = await sight(id, { status: "removed", lat: SPOT.lat, lng: SPOT.lng, taken_at: fresh }, { display: WEBP(), thumb: WEBP() });
    const sid = body.id as string;
    expect((await detail(id)).life_info.status).toBe("dead");
    await db().prepare("UPDATE sightings SET status_review = 'rejected' WHERE id = ?1").bind(sid).run();
    await refreshLife(db(), id);
    expect((await detail(id)).life_info).toMatchObject({ status: "alive", count: 0 });
    expect(((await (await call(`/api/spots/${id}/sightings`)).json()) as unknown[]).length).toBe(0);
    expect((await call(`/img/thumb/${sid}.webp`)).status).toBe(404);
    expect(await bucket().head(`thumb/${sid}.webp`)).not.toBeNull(); // the file stays; it is just not served
  });
});

describe("the daily flip", () => {
  it("turns a living spot nobody has seen for 12 months into unknown", async () => {
    const id = await newSpot();
    await db().prepare("UPDATE spots SET created_at = '2024-01-01T00:00:00.000Z', taken_at = NULL WHERE id = ?1").bind(id).run();
    expect(await flipStaleSpots(db())).toBe(1);
    expect((await detail(id)).life_info.status).toBe("unknown");
    expect(await flipStaleSpots(db())).toBe(0);
  });
  it("leaves recent spots and dead ones alone", async () => {
    const id = await newSpot();
    expect(await flipStaleSpots(db())).toBe(0);
    await db().prepare("UPDATE spots SET created_at = '2023-01-01T00:00:00.000Z', life_status = 'dead' WHERE id = ?1").bind(id).run();
    expect(await flipStaleSpots(db())).toBe(0);
  });
});

describe("GET /api/nearby", () => {
  it("sorts by distance, skips the dead and reports distance and bearing", async () => {
    const near = await newSpot({ lat: -34.9061, lng: -56.1993 });
    const mid = await newSpot({ lat: -34.9161, lng: -56.1993 });
    const far = await newSpot({ lat: -34.9561, lng: -56.2493 });
    const dead = await newSpot({ lat: -34.9062, lng: -56.1993 });
    await db().prepare("UPDATE spots SET life_status = 'dead' WHERE id = ?1").bind(dead).run();
    const res = await call("/api/nearby?lat=-34.9060&lng=-56.1993&limit=10");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { id: string; distance_m: number; bearing: number }[];
    expect(rows.map((r) => r.id)).toEqual([near, mid, far]);
    expect(rows[0]!.distance_m).toBeLessThan(30);
    expect(rows[1]!.bearing).toBeGreaterThan(170);
    expect(rows[1]!.bearing).toBeLessThan(190);
    expect((await call("/api/nearby?lat=abc&lng=1")).status).toBe(400);
  });
});

describe("GET /api/stats/longevity", () => {
  it("summarises life, the cemetery and curves", async () => {
    const a = await newSpot({ taken_at: "2025-01-10T10:00:00" });
    await newSpot();
    await db().prepare("INSERT INTO sightings (id, spot_id, status, created_at, status_review, verified) VALUES ('01HZZZZZZZZZZZZZZZZZZZZZZZ', ?1, 'removed', ?2, 'approved', 1)").bind(a, new Date().toISOString()).run();
    await refreshLife(db(), a);
    const body = (await (await call("/api/stats/longevity")).json()) as { totals: Record<string, number>; cemetery: { id: string; days: number }[]; oldest_living: unknown[]; curves: { key: string; points: { day: number; alive: number }[] }[]; by_type: { key: string; avg_days: number }[] };
    expect(body.totals.dead).toBe(1);
    expect(body.cemetery[0]).toMatchObject({ id: a });
    expect(body.cemetery[0]!.days).toBeGreaterThan(0);
    expect(body.oldest_living).toHaveLength(1);
    expect(body.curves[0]!.key).toBe("all");
    expect(body.curves[0]!.points[0]).toEqual({ day: 0, alive: 1 });
    expect(body.by_type.some((t) => t.key === "papa")).toBe(true);
  });
});
