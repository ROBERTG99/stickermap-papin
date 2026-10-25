import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucket, call, db, JPEG, mockTurnstile, resetState, spotForm, WEBP } from "./helpers";

beforeEach(resetState);
afterEach(() => vi.restoreAllMocks());

async function create(input: Parameters<typeof spotForm>[0], headers: Record<string, string> = {}) {
  const res = await call("/api/spots", { method: "POST", body: spotForm(input), headers });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/spots", () => {
  it("creates a spot with photo, types and reporter (who is also the placer)", async () => {
    mockTurnstile(true);
    const { res, body } = await create({
      meta: { types: ["papa", "sexo-punto"], reporter: "Ana", note: "hola" },
      original: JPEG(200),
    });
    expect(res.status).toBe(201);
    expect(typeof body.id).toBe("string");
    expect(typeof body.editToken).toBe("string");

    const list = (await (await call("/api/spots")).json()) as { features: { id: string; properties: Record<string, unknown> }[] };
    const spot = list.features.find((f) => f.id === body.id)!;
    expect(spot.properties.types).toEqual(["papa", "sexo-punto"]);
    expect(spot.properties.placers).toEqual(["Ana"]);
    expect(spot.properties.placer_status).toBe("self");
    expect(spot.properties.reporter).toBe("Ana");
    expect(spot.properties.thumb).toBe(`/img/thumb/${body.id}.webp`);
    // display, thumb and the private original are in R2
    expect(await bucket().head(`display/${body.id}.webp`)).not.toBeNull();
    expect(await bucket().head(`orig/${body.id}.jpg`)).not.toBeNull();
    // the storage meter counted them
    const meter = await db().prepare("SELECT value FROM settings WHERE key = 'r2_bytes'").first<{ value: string }>();
    expect(Number(meter!.value)).toBeGreaterThan(0);
  });

  it("stores the reporter as the placer, and ignores placer fields a stale client still sends", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: { reporter: "Ana", placer_status: "other", placers: ["Beto"] } });
    const { results } = await db().prepare("SELECT p.display_name AS n FROM spot_placers sp JOIN people p ON p.id = sp.person_id WHERE sp.spot_id = ?1").bind(body.id).all<{ n: string }>();
    expect(results.map((r) => r.n)).toEqual(["Ana"]);
  });

  it("rejects a failed Turnstile check with 403 and writes nothing", async () => {
    mockTurnstile(false);
    const { res } = await create({ meta: {} });
    expect(res.status).toBe(403);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM spots").first<{ n: number }>())!.n).toBe(0);
  });

  it("rejects oversize derivatives with 413", async () => {
    mockTurnstile(true);
    expect((await create({ meta: {}, display: WEBP(1_600_000) })).res.status).toBe(413);
    expect((await create({ meta: {}, thumb: WEBP(250_000) })).res.status).toBe(413);
  });

  it("rejects files that are not images (SVG/HTML) by magic bytes with 415", async () => {
    mockTurnstile(true);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await create({ meta: {}, display: svg, thumb: svg })).res.status).toBe(415);
  });

  it("an anonymous spot has no placers", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: {} });
    const row = await db().prepare("SELECT placer_status FROM spots WHERE id = ?1").bind(body.id).first<{ placer_status: string }>();
    expect(row!.placer_status).toBe("unknown");
    expect((await db().prepare("SELECT COUNT(*) AS n FROM spot_placers WHERE spot_id = ?1").bind(body.id).first<{ n: number }>())!.n).toBe(0);
  });

  it("validates the payload (types, ranges)", async () => {
    mockTurnstile(true);
    expect((await create({ meta: { types: ["nope"] } })).res.status).toBe(400);
    expect((await create({ meta: { lat: 120 } })).res.status).toBe(400);
  });

  it("refuses the same photo twice with 409 and points to the existing spot", async () => {
    mockTurnstile(true);
    const first = await create({ meta: {}, original: JPEG(300) });
    const second = await create({ meta: {}, original: JPEG(300) });
    expect(second.res.status).toBe(409);
    expect(second.body.id).toBe(first.body.id);
  });

  it("rounds coordinates for 'ubicación aproximada'", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: { lat: -34.907178, lng: -56.172886, is_approximate: true } });
    const row = await db().prepare("SELECT lat, lng FROM spots WHERE id = ?1").bind(body.id).first<{ lat: number; lng: number }>();
    expect(row).toEqual({ lat: -34.907, lng: -56.173 });
  });

  it("rate limits single adds per IP (10 per hour)", async () => {
    mockTurnstile(true);
    for (let i = 0; i < 10; i++) expect((await create({ meta: { lat: i } })).res.status).toBe(201);
    expect((await create({ meta: { lat: 11 } })).res.status).toBe(429);
  });
});

describe("edit token", () => {
  async function made() {
    mockTurnstile(true);
    const { body } = await create({ meta: { reporter: "Ana" } });
    return { id: body.id as string, token: body.editToken as string };
  }
  const patch = (id: string, token: string | null, data: unknown) =>
    call(`/api/spots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(token ? { "X-Edit-Token": token } : {}) }, body: JSON.stringify(data) });

  it("lets the submitter edit within 24 h and refuses a wrong or missing token", async () => {
    const { id, token } = await made();
    expect((await patch(id, token, { note: "editado", types: ["sexo-pregunta"] })).status).toBe(200);
    expect((await patch(id, "wrong", { note: "x" })).status).toBe(403);
    expect((await patch(id, null, { note: "x" })).status).toBe(403);
    const row = await db().prepare("SELECT note FROM spots WHERE id = ?1").bind(id).first<{ note: string }>();
    expect(row!.note).toBe("editado");
  });

  it("expires after 24 h", async () => {
    const { id, token } = await made();
    await db().prepare("UPDATE spots SET created_at = ?2 WHERE id = ?1").bind(id, new Date(Date.now() - 25 * 3_600_000).toISOString()).run();
    expect((await patch(id, token, { note: "late" })).status).toBe(403);
  });

  it("marking a spot approximate also coarsens the stored point", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: { lat: -34.907178, lng: -56.172886 } });
    expect((await patch(body.id as string, body.editToken as string, { is_approximate: true })).status).toBe(200);
    const row = await db().prepare("SELECT lat, lng FROM spots WHERE id = ?1").bind(body.id).first<{ lat: number; lng: number }>();
    expect(row).toEqual({ lat: -34.907, lng: -56.173 });
  });

  it("soft-deletes: the spot disappears from the public list and its photos stop being served", async () => {
    const { id, token } = await made();
    expect((await call(`/api/spots/${id}`, { method: "DELETE", headers: { "X-Edit-Token": token } })).status).toBe(200);
    expect((await call(`/api/spots/${id}`)).status).toBe(404);
    expect((await call(`/img/thumb/${id}.webp`)).status).toBe(404);
  });
});

describe("report", () => {
  it("flags the spot for review with the reason", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: {} });
    const res = await call(`/api/spots/${body.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstile_token: "t" }) });
    expect(res.status).toBe(200);
    const row = await db().prepare("SELECT needs_review, review_reason FROM spots WHERE id = ?1").bind(body.id).first<{ needs_review: number; review_reason: string }>();
    expect(row).toEqual({ needs_review: 1, review_reason: "reported" });
  });
});

describe("add a type to an existing spot", () => {
  it("unions types and credits the person who adds one", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: { reporter: "Ana" } });
    const res = await call(`/api/spots/${body.id}/types`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ types: ["sexo-punto"], reporter: "Caro", turnstile_token: "t" }),
    });
    expect(res.status).toBe(200);
    const detail = (await (await call(`/api/spots/${body.id}`)).json()) as { types: string[]; placers: string[] };
    expect(detail.types).toEqual(["papa", "sexo-punto"]);
    expect(detail.placers).toEqual(["Ana", "Caro"]);
  });
});

describe("Instagram (F2)", () => {
  beforeEach(async () => { await db().prepare("UPDATE settings SET value = 'on' WHERE key = 'feature_instagram'").run(); });

  it("stores the handle once, lowercase and without @, plus the normalized post link", async () => {
    mockTurnstile(true);
    const { res, body } = await create({ meta: { reporter: "Chimbo", reporter_instagram: " @Chimbo.Papin ", instagram_post_url: "instagram.com/reel/C8xQ2p?igsh=abc" } });
    expect(res.status).toBe(201);
    const people = (await (await call("/api/people")).json()) as { name: string; instagram?: string }[];
    expect(people.find((p) => p.name === "Chimbo")?.instagram).toBe("chimbo.papin");
    const detail = (await (await call(`/api/spots/${body.id}`)).json()) as { ig?: Record<string, string>; ig_post?: string };
    expect(detail.ig).toEqual({ Chimbo: "chimbo.papin" });
    expect(detail.ig_post).toBe("https://www.instagram.com/reel/C8xQ2p/");
    const list = (await (await call("/api/spots")).json()) as { features: { id: string; properties: { ig?: Record<string, string>; ig_post?: string } }[] };
    expect(list.features.find((f) => f.id === body.id)?.properties.ig).toEqual({ Chimbo: "chimbo.papin" });
  });

  it("the public form cannot change an existing handle or take one that belongs to someone else", async () => {
    mockTurnstile(true);
    await create({ meta: { reporter: "Chimbo", reporter_instagram: "chimbo.papin" } });
    await create({ meta: { reporter: "Chimbo", reporter_instagram: "otro.perfil" } });
    await create({ meta: { reporter: "Coco", reporter_instagram: "chimbo.papin" } });
    const rows = await db().prepare("SELECT display_name AS n, instagram_handle AS h FROM people ORDER BY display_name").all<{ n: string; h: string | null }>();
    expect(rows.results).toEqual([{ n: "Chimbo", h: "chimbo.papin" }, { n: "Coco", h: null }]);
  });

  it("ignores the handle while the feature is off or spots wait for approval", async () => {
    mockTurnstile(true);
    await db().prepare("UPDATE settings SET value = 'off' WHERE key = 'feature_instagram'").run();
    await create({ meta: { reporter: "Ana", reporter_instagram: "ana.papa" } });
    await db().prepare("UPDATE settings SET value = 'on' WHERE key = 'feature_instagram'").run();
    await db().prepare("UPDATE settings SET value = 'approval' WHERE key = 'moderation_mode'").run();
    await create({ meta: { reporter: "Beto", reporter_instagram: "beto.papa" } });
    const rows = await db().prepare("SELECT display_name AS n, instagram_handle AS h FROM people ORDER BY display_name").all<{ n: string; h: string | null }>();
    expect(rows.results).toEqual([{ n: "Ana", h: null }, { n: "Beto", h: null }]);
    await db().prepare("UPDATE settings SET value = 'off' WHERE key = 'feature_instagram'").run();
  });

  it("rejects an invalid handle or post link", async () => {
    mockTurnstile(true);
    expect((await create({ meta: { reporter: "Ana", reporter_instagram: "no..good" } })).res.status).toBe(400);
    expect((await create({ meta: { reporter: "Ana", instagram_post_url: "https://example.com/p/abc" } })).res.status).toBe(400);
  });
});
