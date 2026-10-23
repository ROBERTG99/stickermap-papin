import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGeocodeCron } from "../../worker/cron/geocode";
import { bucket, call, db, JPEG, mockTurnstile, resetState, spotForm, WEBP } from "./helpers";

beforeEach(resetState);
afterEach(() => vi.restoreAllMocks());

async function seedSpot(id: string, over: Record<string, unknown> = {}) {
  const row = { lat: -34.9, lng: -56.16, status: "published", place_name: "Montevideo", country: "Uruguay", country_code: "uy", ...over };
  await db().batch([
    db().prepare("INSERT INTO spots (id, lat, lng, location_source, placer_status, created_at, updated_at, status, place_name, country, country_code, photo_key, thumb_key) VALUES (?1, ?2, ?3, 'pin', 'unknown', ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(id, row.lat, row.lng, "2025-04-15T10:00:00.000Z", row.status, row.place_name, row.country, row.country_code, `display/${id}.webp`, `thumb/${id}.webp`),
    db().prepare("INSERT INTO spot_types (spot_id, type_slug) VALUES (?1, 'papa')").bind(id),
  ]);
  await bucket().put(`display/${id}.webp`, WEBP(100), { httpMetadata: { contentType: "image/webp" } });
  await bucket().put(`thumb/${id}.webp`, WEBP(50), { httpMetadata: { contentType: "image/webp" } });
}

describe("public reads", () => {
  it("lists only published spots with a stable digest ETag and answers 304", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ1");
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ2", { status: "hidden" });
    const res = await call("/api/spots");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { features: { id: string }[] };
    expect(body.features.map((f) => f.id)).toEqual(["01HZZZZZZZZZZZZZZZZZZZZZZ1"]);
    const etag = res.headers.get("ETag")!;
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    const again = await call("/api/spots", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
  });

  it("serves types, people, stats and config", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ1");
    const types = (await (await call("/api/types")).json()) as { slug: string; count: number; icon: string }[];
    expect(types.map((t) => t.slug)).toEqual(["papa", "sexo-punto", "sexo-pregunta", "sexo-pregunta-og", "otro"]);
    expect(types[0]).toMatchObject({ slug: "papa", count: 1, icon: "/img/icons/papa.png" });
    const stats = (await (await call("/api/stats")).json()) as { total_spots: number; total_countries: number };
    expect(stats).toMatchObject({ total_spots: 1, total_countries: 1 });
    const config = (await (await call("/api/config")).json()) as { features: Record<string, boolean>; default_lang: string };
    expect(config.default_lang).toBe("es");
    expect(config.features).toEqual({ video: false, instagram: false, sightings: false, globe_wrapped: false });
  });

  it("does not report an admin-only feature flag to anonymous visitors", async () => {
    await db().prepare("UPDATE settings SET value = 'admin' WHERE key = 'feature_video'").run();
    const config = (await (await call("/api/config")).json()) as { features: { video: boolean } };
    expect(config.features.video).toBe(false);
    await db().prepare("UPDATE settings SET value = 'on' WHERE key = 'feature_video'").run();
    expect(((await (await call("/api/config")).json()) as { features: { video: boolean } }).features.video).toBe(true);
  });

  it("builds Open Graph tags for /s/:id", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ1");
    const html = await (await call("/s/01HZZZZZZZZZZZZZZZZZZZZZZ1")).text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Papa en Montevideo, Uruguay");
    expect(html).toContain("/img/display/01HZZZZZZZZZZZZZZZZZZZZZZ1.webp");
  });
});

describe("/img", () => {
  it("streams display, thumb and icons with long immutable caching and blocks everything else", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ1");
    await bucket().put("icons/papa.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { httpMetadata: { contentType: "image/png" } });
    await bucket().put("orig/01HZZZZZZZZZZZZZZZZZZZZZZ1.jpg", JPEG(), { httpMetadata: { contentType: "image/jpeg" } });
    await bucket().put("backups/d1/x.sql.gz", new Uint8Array([1]));
    const thumb = await call("/img/thumb/01HZZZZZZZZZZZZZZZZZZZZZZ1.webp");
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("Cache-Control")).toContain("immutable");
    expect(thumb.headers.get("Content-Type")).toBe("image/webp");
    expect((await call("/img/icons/papa.png")).status).toBe(200);
    expect((await call("/img/orig/01HZZZZZZZZZZZZZZZZZZZZZZ1.jpg")).status).toBe(404);
    expect((await call("/img/backups/d1/x.sql.gz")).status).toBe(404);
    expect((await call("/img/display/../orig/x.jpg")).status).toBe(404);
  });

  it("stops serving photos of hidden or pending spots", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ2", { status: "hidden" });
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZZ3", { status: "pending" });
    expect((await call("/img/thumb/01HZZZZZZZZZZZZZZZZZZZZZZ2.webp")).status).toBe(404);
    expect((await call("/img/display/01HZZZZZZZZZZZZZZZZZZZZZZ3.webp")).status).toBe(404);
  });
});

describe("admin", () => {
  it("answers 401 without a Cloudflare Access JWT", async () => {
    for (const path of ["/api/admin/me", "/api/admin/spots", "/api/admin/settings", "/api/admin/export?format=csv"]) {
      expect((await call(path)).status).toBe(401);
    }
    expect((await call("/api/admin/spots/bulk", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await call("/api/admin/img/display/x.webp")).status).toBe(401);
  });
});

describe("admin entry on the public Worker", () => {
  it("sends /admin to the Access-protected admin Worker, keeping path and query", async () => {
    const res = await call("/admin/datos?status=queue", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://admin.example.test/admin/datos?status=queue");
    expect((await call("/admin", { redirect: "manual" })).status).toBe(302);
  });
});

describe("bulk add", () => {
  async function startBatch() {
    mockTurnstile(true);
    const res = await call("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reporter: "Ana", turnstile_token: "t" }) });
    expect(res.status).toBe(201);
    return (await res.json()) as { batchId: string; batchToken: string; editToken: string };
  }
  const add = (token: string, ref: string, meta: Record<string, unknown> = {}, original?: Uint8Array) =>
    call("/api/spots", { method: "POST", headers: { "X-Batch-Token": token }, body: spotForm({ meta: { client_ref: ref, turnstile_token: undefined, ...meta }, original }) });

  it("creates spots with the batch token (no Turnstile) and is idempotent per client_ref", async () => {
    const batch = await startBatch();
    const first = await add(batch.batchToken, "photo-1", { lat: 1 }, JPEG(100));
    expect(first.status).toBe(201);
    const id = ((await first.json()) as { id: string }).id;
    const retry = await add(batch.batchToken, "photo-1", { lat: 1 }, JPEG(100));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ id, existing: true });
    expect((await db().prepare("SELECT COUNT(*) AS n FROM spots").first<{ n: number }>())!.n).toBe(1);
    expect((await db().prepare("SELECT created_count FROM batches WHERE id = ?1").bind(batch.batchId).first<{ created_count: number }>())!.created_count).toBe(1);
  });

  it("requires a client_ref and rejects forged or missing tokens", async () => {
    const batch = await startBatch();
    const noRef = await call("/api/spots", { method: "POST", headers: { "X-Batch-Token": batch.batchToken }, body: spotForm({ meta: { turnstile_token: undefined } }) });
    expect(noRef.status).toBe(400);
    expect((await add(`${batch.batchToken}x`, "p")).status).toBe(401);
    expect((await add("garbage", "p")).status).toBe(401);
  });

  it("refuses spots beyond max_spots, even when uploads race", async () => {
    const batch = await startBatch();
    await db().prepare("UPDATE batches SET max_spots = 2 WHERE id = ?1").bind(batch.batchId).run();
    const results = await Promise.all([1, 2, 3, 4].map((i) => add(batch.batchToken, `p${i}`, { lat: i })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(2);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM spots").first<{ n: number }>())!.n).toBe(2);
  });

  it("'Borrar este lote' hides every spot with the batch edit token, and only with it", async () => {
    const batch = await startBatch();
    await add(batch.batchToken, "a", { lat: 1 });
    await add(batch.batchToken, "b", { lat: 2 });
    expect((await call(`/api/batches/${batch.batchId}`, { method: "DELETE", headers: { "X-Edit-Token": "nope" } })).status).toBe(403);
    const res = await call(`/api/batches/${batch.batchId}`, { method: "DELETE", headers: { "X-Edit-Token": batch.editToken } });
    expect(await res.json()).toEqual({ id: batch.batchId, hidden: 2 });
    expect(((await (await call("/api/spots")).json()) as { features: unknown[] }).features).toHaveLength(0);
  });

  it("limits batches per IP per day (3)", async () => {
    mockTurnstile(true);
    const start = () => call("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstile_token: "t" }) });
    for (let i = 0; i < 3; i++) expect((await start()).status).toBe(201);
    expect((await start()).status).toBe(429);
  });
});

describe("geocode cron", () => {
  const nominatim = () => vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({ address: { city: "Montevideo", state: "Montevideo", country: "Uruguay", country_code: "uy" } }));

  it("never makes more than 4 Nominatim requests per run, one per distinct 3-decimal key", async () => {
    for (let i = 0; i < 8; i++) await seedSpot(`01HZZZZZZZZZZZZZZZZZZZZZ${i}0`, { lat: 10 + i, lng: 20, place_name: null, country: null, country_code: null });
    // two spots sharing a cache key count as one request
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZ99", { lat: 10, lng: 20.0001, place_name: null, country: null, country_code: null });
    const spy = nominatim();
    const out = await runGeocodeCron(env, Date.now());
    expect(out.requests).toBe(4);
    expect(spy).toHaveBeenCalledTimes(4);
    const filled = await db().prepare("SELECT COUNT(*) AS n FROM spots WHERE place_name IS NOT NULL").first<{ n: number }>();
    expect(filled!.n).toBeGreaterThanOrEqual(4);
    expect((await call(`/api/spots/01HZZZZZZZZZZZZZZZZZZZZZ00`)).status).toBe(200);
  }, 20_000);

  it("uses the cache before asking Nominatim and backs off for an hour on 429", async () => {
    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZA0", { lat: 5, lng: 5, place_name: null, country: null, country_code: null });
    await db().prepare("INSERT INTO geocode_cache (key, place_name, city, country, country_code, fetched_at) VALUES ('5.000,5.000', 'Cacheado', 'Cacheado', 'Uruguay', 'uy', '2025-01-01')").run();
    const spy = nominatim();
    expect((await runGeocodeCron(env)).requests).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect((await db().prepare("SELECT place_name FROM spots WHERE id = '01HZZZZZZZZZZZZZZZZZZZZZA0'").first<{ place_name: string }>())!.place_name).toBe("Cacheado");

    await seedSpot("01HZZZZZZZZZZZZZZZZZZZZZB0", { lat: 6, lng: 6, place_name: null, country: null, country_code: null });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("slow down", { status: 429 }));
    await runGeocodeCron(env, 1_000);
    const again = vi.spyOn(globalThis, "fetch");
    again.mockClear();
    expect((await runGeocodeCron(env, 1_000 + 60_000)).requests).toBe(0);
    expect(again).not.toHaveBeenCalled();
  }, 20_000);
});
