import { Hono } from "hono";
import { addTypesBody, createSpotMeta, MAX, patchOwnSpot, reportBody, sha256List } from "../../src/shared/schema";
import { round3 } from "../../src/shared/geo";
import { newUlid } from "../../src/shared/ulid";
import { normalizeHandle, normalizePostUrl } from "../../src/shared/instagram";
import type { SpotDetail } from "../../src/shared/types";
import { adminFromRequest } from "../lib/access";
import { hashToken, randomToken, sha256Hex, timingSafeEqual, verifyBatchToken } from "../lib/crypto";
import { CONTENT_TYPE, EXTENSION, VIDEO_CONTENT_TYPE, sniffImage, sniffVideo, type ImageKind, type VideoKind } from "../lib/images";
import { featureEnabled } from "../lib/features";
import { findOrCreatePerson, placerStatusFor } from "../lib/people";
import { allowed, ipHash, record } from "../lib/ratelimit";
import { meterStatement, putAll, type PutObject } from "../lib/r2";
import { publishedCollection } from "../lib/spots";
import { verifyTurnstile } from "../lib/turnstile";
import type { AppEnv } from "../app";
import { bustSpotsCache, cachedJson } from "../lib/cache";

export const spots = new Hono<AppEnv>();

const EDIT_WINDOW_MS = 24 * 3_600_000;

// ── helpers ───────────────────────────────────────────────────────────────

function clientIp(req: Request): string | null {
  return req.headers.get("CF-Connecting-IP");
}

async function settingsMap(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}

/** Every requested slug must be an active type; free text only for types that allow it. */
async function checkTypes(db: D1Database, slugs: string[], otherText: string | null | undefined): Promise<string | null> {
  const unique = [...new Set(slugs)];
  const { results } = await db
    .prepare(`SELECT slug, allows_text FROM sticker_types WHERE is_active = 1 AND slug IN (${unique.map(() => "?").join(",")})`)
    .bind(...unique)
    .all<{ slug: string; allows_text: number }>();
  if (results.length !== unique.length) return "unknown_type";
  if (otherText && !results.some((r) => r.allows_text === 1)) return "other_text_not_allowed";
  return null;
}

interface CheckedFile { bytes: ArrayBuffer; kind: ImageKind }

async function readImage(part: unknown, maxBytes: number, allowHeic: boolean): Promise<CheckedFile | "too_large" | "bad_image" | null> {
  if (part === null || part === undefined || typeof part === "string") return null;
  const file = part as File;
  if (file.size === 0) return null;
  if (file.size > maxBytes) return "too_large";
  const bytes = await file.arrayBuffer();
  const kind = sniffImage(new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength)));
  if (!kind || (!allowHeic && kind === "heic")) return "bad_image";
  return { bytes, kind };
}

interface CheckedVideo { bytes: ArrayBuffer; kind: VideoKind }

/** `video/mp4` by magic bytes up to 60 MB; QuickTime only as the untranscoded fallback (50 MB). */
async function readVideo(part: unknown): Promise<CheckedVideo | "too_large" | "bad_video" | null> {
  if (part === null || part === undefined || typeof part === "string") return null;
  const file = part as File;
  if (file.size === 0) return null;
  if (file.size > MAX.videoBytes) return "too_large";
  const bytes = await file.arrayBuffer();
  const kind = sniffVideo(new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength)));
  if (!kind) return "bad_video";
  if (kind === "mov" && bytes.byteLength > MAX.videoFallbackBytes) return "too_large";
  return { bytes, kind };
}

type Authorized = { ok: true; batchId: string | null } | { ok: false; status: 401 | 403 | 429; error: string };

/** Single adds need a Turnstile token; bulk photos carry the batch token instead (BUILD.md §7.3b). */
async function authorizeCreate(c: { env: AppEnv["Bindings"]; req: { raw: Request; header: (n: string) => string | undefined } }, turnstileToken: string | null | undefined, ipHashValue: string): Promise<Authorized> {
  const batchToken = c.req.header("X-Batch-Token");
  if (batchToken) {
    const claims = await verifyBatchToken(c.env.IP_HASH_SECRET, batchToken);
    if (!claims) return { ok: false, status: 401, error: "invalid_batch_token" };
    if (!(await allowed(c.env.DB, ipHashValue, "batch_spot"))) return { ok: false, status: 429, error: "rate_limited" };
    return { ok: true, batchId: claims.batchId };
  }
  const hostname = new URL(c.req.raw.url).hostname;
  if (!(await verifyTurnstile(c.env, turnstileToken, clientIp(c.req.raw), hostname))) return { ok: false, status: 403, error: "turnstile_failed" };
  if (!(await allowed(c.env.DB, ipHashValue, "single"))) return { ok: false, status: 429, error: "rate_limited" };
  return { ok: true, batchId: null };
}

// ── reads ─────────────────────────────────────────────────────────────────

spots.get("/", (c) =>
  cachedJson(c, async () => {
    const { collection, etag } = await publishedCollection(c.env.DB);
    return { body: collection, etag };
  }),
);

spots.get("/exists", async (c) => {
  const sha = c.req.query("sha") ?? "";
  if (!/^[0-9a-f]{64}$/.test(sha)) return c.json({ error: "bad_sha" }, 400);
  const row = await c.env.DB.prepare("SELECT id FROM spots WHERE photo_sha256 = ?1 AND status = 'published'").bind(sha).first<{ id: string }>();
  return row ? c.json({ id: row.id }) : c.json({ error: "not_found" }, 404);
});

spots.post("/exists", async (c) => {
  const parsed = sha256List.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const hashes = [...new Set(parsed.data.sha256)];
  if (hashes.length === 0) return c.json({});
  const { results } = await c.env.DB
    .prepare(`SELECT photo_sha256 AS sha, id FROM spots WHERE status = 'published' AND photo_sha256 IN (${hashes.map(() => "?").join(",")})`)
    .bind(...hashes)
    .all<{ sha: string; id: string }>();
  return c.json(Object.fromEntries(results.map((r) => [r.sha, r.id])));
});

export async function loadSpotDetail(db: D1Database, id: string): Promise<SpotDetail | null> {
  const [row, types, placers] = await db.batch([
    db.prepare(
      `SELECT s.*, rp.display_name AS reporter FROM spots s LEFT JOIN people rp ON rp.id = s.reporter_person_id WHERE s.id = ?1 AND s.status = 'published'`,
    ).bind(id),
    db.prepare("SELECT type_slug AS slug FROM spot_types st JOIN sticker_types t ON t.slug = st.type_slug WHERE spot_id = ?1 ORDER BY t.sort_order").bind(id),
    db.prepare("SELECT p.display_name AS name, p.instagram_handle AS ig FROM spot_placers sp JOIN people p ON p.id = sp.person_id WHERE sp.spot_id = ?1 ORDER BY p.display_name").bind(id),
  ]);
  const s = row?.results[0] as Record<string, unknown> | undefined;
  if (!s) return null;
  const t = (types?.results ?? []).map((r) => (r as { slug: string }).slug);
  const key = (k: unknown) => (typeof k === "string" ? `/img/${k}` : null);
  const ig = Object.fromEntries(((placers?.results ?? []) as { name: string; ig: string | null }[]).filter((r) => r.ig).map((r) => [r.name, r.ig!]));
  return {
    id: s.id as string, types: t, placers: (placers?.results ?? []).map((r) => (r as { name: string }).name),
    placer_status: s.placer_status as SpotDetail["placer_status"], reporter: (s.reporter as string | null) ?? null,
    place_name: (s.place_name as string) || null, country: (s.country as string | null) ?? null, country_code: (s.country_code as string | null) ?? null,
    taken_at: (s.taken_at as string | null) ?? null, created_at: s.created_at as string, thumb: key(s.thumb_key), photo: key(s.photo_key), n: t.length,
    lat: s.lat as number, lng: s.lng as number, location_source: s.location_source as SpotDetail["location_source"],
    location_accuracy_m: (s.location_accuracy_m as number | null) ?? null, is_approximate: s.is_approximate === 1,
    city: (s.city as string | null) ?? null, note: (s.note as string | null) ?? null, other_text: (s.other_text as string | null) ?? null,
    placer_note: (s.placer_note as string | null) ?? null, photo_w: (s.photo_w as number | null) ?? null, photo_h: (s.photo_h as number | null) ?? null,
    ...(Object.keys(ig).length ? { ig } : {}), ...(typeof s.instagram_post_url === "string" ? { ig_post: s.instagram_post_url } : {}),
    ...(typeof s.video_key === "string"
      ? { v: (s.video_key.endsWith(".mov") ? "mov" : "mp4") as "mp4" | "mov", video: { src: `/media/${s.video_key}`, poster: key(s.video_poster_key), duration_ms: (s.video_duration_ms as number | null) ?? null, w: (s.video_w as number | null) ?? null, h: (s.video_h as number | null) ?? null } }
      : {}),
  };
}

spots.get("/:id", async (c) => {
  const detail = await loadSpotDetail(c.env.DB, c.req.param("id"));
  if (!detail) return c.json({ error: "not_found" }, 404);
  return c.json(detail, 200, { "Cache-Control": "public, max-age=60" });
});

// ── create ────────────────────────────────────────────────────────────────

spots.post("/", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > MAX.originalBytes + MAX.videoBytes + MAX.displayBytes * 2 + MAX.thumbBytes + 200_000) return c.json({ error: "too_large" }, 413);
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "bad_request" }, 400);
  let rawMeta: unknown;
  try { rawMeta = JSON.parse(String(form.get("meta") ?? "")); } catch { return c.json({ error: "bad_meta" }, 400); }
  const parsed = createSpotMeta.safeParse(rawMeta);
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const meta = parsed.data;

  const ipH = await ipHash(c.env.IP_HASH_SECRET, clientIp(c.req.raw));
  const auth = await authorizeCreate(c, meta.turnstile_token, ipH);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const db = c.env.DB;
  if (auth.batchId) {
    if (!meta.client_ref) return c.json({ error: "client_ref_required" }, 400);
    const dup = await db.prepare("SELECT id FROM spots WHERE batch_id = ?1 AND client_ref = ?2").bind(auth.batchId, meta.client_ref).first<{ id: string }>();
    if (dup) return c.json({ id: dup.id, existing: true });
    const batch = await db.prepare("SELECT created_count, max_spots, expires_at FROM batches WHERE id = ?1").bind(auth.batchId).first<{ created_count: number; max_spots: number; expires_at: string }>();
    if (!batch || batch.expires_at < new Date().toISOString()) return c.json({ error: "invalid_batch_token" }, 401);
    if (batch.created_count >= batch.max_spots) return c.json({ error: "batch_full" }, 409);
  }
  /** The slot is reserved atomically right before writing (parallel uploads cannot overshoot max_spots) and released on failure. */
  let slotReserved = false;
  const releaseSlot = async () => {
    if (slotReserved && auth.batchId) await db.prepare("UPDATE batches SET created_count = MAX(0, created_count - 1) WHERE id = ?1").bind(auth.batchId).run();
    slotReserved = false;
  };

  const typeError = await checkTypes(db, meta.types, meta.other_text);
  if (typeError) return c.json({ error: typeError }, 400);

  const display = await readImage(form.get("display"), MAX.displayBytes, false);
  const thumb = await readImage(form.get("thumb"), MAX.thumbBytes, false);
  const original = await readImage(form.get("original"), MAX.originalBytes, true);
  for (const f of [display, thumb, original]) {
    if (f === "too_large") return c.json({ error: "too_large" }, 413);
    if (f === "bad_image") return c.json({ error: "bad_image" }, 415);
  }
  const d = display as CheckedFile | null;
  const t = thumb as CheckedFile | null;
  const o = original as CheckedFile | null;
  if (!!d !== !!t) return c.json({ error: "display_and_thumb_go_together" }, 400);
  // Browsers that cannot encode WebP from a canvas (Safari) send JPEG instead; either way the pixels were re-encoded client-side, so no EXIF.
  const derived = (f: CheckedFile | null) => f !== null && (f.kind === "webp" || f.kind === "jpeg");
  if ((d && !derived(d)) || (t && !derived(t))) return c.json({ error: "bad_image" }, 415);

  const video = await readVideo(form.get("video"));
  if (video === "too_large") return c.json({ error: "too_large" }, 413);
  if (video === "bad_video") return c.json({ error: "bad_video" }, 415);
  const posterPart = await readImage(form.get("video_poster"), MAX.displayBytes, false);
  if (posterPart === "too_large") return c.json({ error: "too_large" }, 413);
  if (posterPart === "bad_image") return c.json({ error: "bad_image" }, 415);
  const v = video as CheckedVideo | null;
  const poster = posterPart as CheckedFile | null;
  if (poster && !derived(poster)) return c.json({ error: "bad_image" }, 415);
  if (v && !d && !poster) return c.json({ error: "video_needs_poster" }, 400);
  if (v) {
    // F1 is behind its flag on the server too: an old cached client cannot upload a video while the feature is off
    if (!(await featureEnabled(c.env, c.req.raw, await settingsMap(db), "video"))) return c.json({ error: "feature_off" }, 403);
    const used = Number((await db.prepare("SELECT value FROM settings WHERE key = 'r2_bytes'").first<{ value: string }>())?.value ?? 0);
    if (used >= MAX.videoStorageCap) return c.json({ error: "storage_full_video" }, 507);
  }

  const sha = o ? await sha256Hex(o.bytes) : (meta.photo_sha256 ?? null);
  if (sha) {
    const existing = await db.prepare("SELECT id FROM spots WHERE photo_sha256 = ?1 AND status != 'hidden'").bind(sha).first<{ id: string }>();
    if (existing) return c.json({ error: "photo_exists", id: existing.id }, 409);
  }

  const settings = await settingsMap(db);
  const id = newUlid();
  const now = new Date().toISOString();
  const lat = meta.is_approximate ? round3(meta.lat) : meta.lat;
  const lng = meta.is_approximate ? round3(meta.lng) : meta.lng;
  const objects: PutObject[] = [];
  const displayKey = d ? `display/${id}.${EXTENSION[d.kind]}` : null;
  const thumbKey = t ? `thumb/${id}.${EXTENSION[t.kind]}` : null;
  if (d && t && displayKey && thumbKey) {
    objects.push({ key: displayKey, body: d.bytes, contentType: CONTENT_TYPE[d.kind] }, { key: thumbKey, body: t.bytes, contentType: CONTENT_TYPE[t.kind] });
  }
  if (o) objects.push({ key: `orig/${id}.${EXTENSION[o.kind]}`, body: o.bytes, contentType: CONTENT_TYPE[o.kind] });
  const videoKey = v ? `video/${id}.${v.kind}` : null;
  // with a photo the poster is a second image; without one the poster IS the spot's photo (the client derives display + thumb from it)
  const posterKey = v ? (d && poster ? `display/${id}-poster.${EXTENSION[poster.kind]}` : displayKey) : null;
  if (v && videoKey) objects.push({ key: videoKey, body: v.bytes, contentType: VIDEO_CONTENT_TYPE[v.kind] });
  if (v && d && poster && posterKey) objects.push({ key: posterKey, body: poster.bytes, contentType: CONTENT_TYPE[poster.kind] });
  const needsTranscode = !!v && (v.kind === "mov" || meta.video_needs_transcode);

  const reporterId = meta.reporter ? await findOrCreatePerson(db, meta.reporter) : null;
  const placerIds = reporterId ? [reporterId] : [];
  const igHandle = normalizeHandle(meta.reporter_instagram);
  const igPost = normalizePostUrl(meta.instagram_post_url);
  const editToken = auth.batchId ? null : randomToken();
  const editHash = editToken ? await hashToken(editToken) : null;
  const bytes = objects.reduce((n, x) => n + x.body.byteLength, 0);

  if (auth.batchId) {
    const res = await db.prepare("UPDATE batches SET created_count = created_count + 1 WHERE id = ?1 AND created_count < max_spots AND expires_at > ?2")
      .bind(auth.batchId, new Date().toISOString()).run();
    if (res.meta.changes !== 1) return c.json({ error: "batch_full" }, 409);
    slotReserved = true;
  }
  try {
    await putAll(c.env, objects);
  } catch {
    await releaseSlot();
    return c.json({ error: "storage_failed" }, 502);
  }
  const insertSpot = db
    .prepare(
      `INSERT INTO spots (id, lat, lng, location_source, location_accuracy_m, is_approximate, reporter_person_id, reporter_raw, placer_status, placer_note, note, other_text,
         photo_key, thumb_key, orig_key, photo_sha256, taken_at, created_at, updated_at, status, edit_token_hash, batch_id, client_ref, submitter_ip_hash, instagram_post_url,
         video_key, video_poster_key, video_duration_ms, video_w, video_h, video_bytes, video_needs_transcode, needs_review, review_reason)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33)`,
    )
    .bind(
      id, lat, lng, meta.location_source, meta.location_accuracy_m ?? null, meta.is_approximate ? 1 : 0, reporterId, meta.reporter ?? null, placerStatusFor(reporterId),
      null, meta.note ?? null, meta.other_text ?? null,
      displayKey, thumbKey, o ? `orig/${id}.${EXTENSION[o.kind]}` : null, sha, meta.taken_at ?? null, now,
      settings.moderation_mode === "approval" ? "pending" : "published", editHash, auth.batchId, meta.client_ref ?? null, ipH, igPost,
      videoKey, posterKey, v ? (meta.video_duration_ms ?? null) : null, v ? (meta.video_w ?? null) : null, v ? (meta.video_h ?? null) : null, v ? v.bytes.byteLength : null,
      needsTranscode ? 1 : 0, needsTranscode ? 1 : 0, needsTranscode ? "video_needs_transcode" : null,
    );
  const statements: D1PreparedStatement[] = [
    insertSpot,
    ...[...new Set(meta.types)].map((slug) => db.prepare("INSERT INTO spot_types (spot_id, type_slug) VALUES (?1, ?2)").bind(id, slug)),
    ...placerIds.map((pid) => db.prepare("INSERT INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(id, pid)),
    db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ('submitter', 'create', 'spot', ?1)").bind(id),
  ];
  // anti-hijack: the public form can only fill an empty handle (and never one that already belongs to someone else); changing it is admin-only.
  // Not while the feature is off, and not while spots wait for approval: an unreviewed submission must not edit a public person (the admin can set it in People).
  if (reporterId && igHandle && settings.moderation_mode !== "approval" && (await featureEnabled(c.env, c.req.raw, settings, "instagram"))) {
    statements.push(
      db.prepare("UPDATE people SET instagram_handle = ?2 WHERE id = ?1 AND instagram_handle IS NULL AND NOT EXISTS (SELECT 1 FROM people WHERE instagram_handle = ?2)").bind(reporterId, igHandle),
    );
  }
  if (bytes > 0) statements.push(meterStatement(db, bytes));
  try {
    await db.batch(statements);
  } catch (error) {
    await c.env.PHOTOS.delete(objects.map((x) => x.key));
    await releaseSlot();
    // a concurrent retry of the same batch photo / same file: report the winner instead of an error
    const winner = auth.batchId && meta.client_ref
      ? await db.prepare("SELECT id FROM spots WHERE batch_id = ?1 AND client_ref = ?2").bind(auth.batchId, meta.client_ref).first<{ id: string }>()
      : sha ? await db.prepare("SELECT id FROM spots WHERE photo_sha256 = ?1 AND status != 'hidden'").bind(sha).first<{ id: string }>() : null;
    if (winner) return auth.batchId ? c.json({ id: winner.id, existing: true }) : c.json({ error: "photo_exists", id: winner.id }, 409);
    throw error;
  }
  await record(db, ipH, auth.batchId ? "batch_spot" : "single");
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json(auth.batchId ? { id } : { id, editToken }, 201);
});

// ── add types to an existing spot ("same photo, another sticker") ─────────

spots.post("/:id/types", async (c) => {
  const parsed = addTypesBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const body = parsed.data;
  const ipH = await ipHash(c.env.IP_HASH_SECRET, clientIp(c.req.raw));
  if (!(await verifyTurnstile(c.env, body.turnstile_token, clientIp(c.req.raw), new URL(c.req.url).hostname))) return c.json({ error: "turnstile_failed" }, 403);
  if (!(await allowed(c.env.DB, ipH, "single"))) return c.json({ error: "rate_limited" }, 429);
  const id = c.req.param("id");
  const spot = await c.env.DB.prepare("SELECT id FROM spots WHERE id = ?1 AND status = 'published'").bind(id).first();
  if (!spot) return c.json({ error: "not_found" }, 404);
  const typeError = await checkTypes(c.env.DB, body.types, body.other_text);
  if (typeError) return c.json({ error: typeError }, 400);

  const reporterId = body.reporter ? await findOrCreatePerson(c.env.DB, body.reporter) : null;
  const placerIds = reporterId ? [reporterId] : [];
  const db = c.env.DB;
  await db.batch([
    ...[...new Set(body.types)].map((slug) => db.prepare("INSERT OR IGNORE INTO spot_types (spot_id, type_slug) VALUES (?1, ?2)").bind(id, slug)),
    // a union of placers: the added type may have been stuck by someone else
    ...placerIds.map((pid) => db.prepare("INSERT OR IGNORE INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(id, pid)),
    db.prepare(
      `UPDATE spots SET updated_at = ?2, placer_status = CASE WHEN ?3 > 0 AND placer_status = 'unknown' THEN ?4 ELSE placer_status END WHERE id = ?1`,
    ).bind(id, new Date().toISOString(), placerIds.length, "self"),
    db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES ('submitter', 'add_types', 'spot', ?1, ?2)").bind(id, JSON.stringify({ types: body.types })),
  ]);
  await record(db, ipH, "single");
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id });
});

// ── edit / delete own spot (24 h) ─────────────────────────────────────────

interface Editable { id: string; created_at: string; edit_token_hash: string | null; batch_id: string | null }

async function canEdit(c: { env: AppEnv["Bindings"]; req: { raw: Request; header: (n: string) => string | undefined } }, spot: Editable): Promise<boolean> {
  if (await adminFromRequest(c.env, c.req.raw)) return true;
  const token = c.req.header("X-Edit-Token");
  if (!token) return false;
  const hash = await hashToken(token);
  const fresh = (iso: string) => Date.now() - Date.parse(iso) <= EDIT_WINDOW_MS;
  if (spot.edit_token_hash && fresh(spot.created_at) && timingSafeEqual(hash, spot.edit_token_hash)) return true;
  if (spot.batch_id) {
    const batch = await c.env.DB.prepare("SELECT edit_token_hash, created_at FROM batches WHERE id = ?1").bind(spot.batch_id).first<{ edit_token_hash: string; created_at: string }>();
    return !!batch && fresh(batch.created_at) && timingSafeEqual(hash, batch.edit_token_hash);
  }
  return false;
}

async function loadEditable(db: D1Database, id: string): Promise<Editable | null> {
  return db.prepare("SELECT id, created_at, edit_token_hash, batch_id FROM spots WHERE id = ?1").bind(id).first<Editable>();
}

spots.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const spot = await loadEditable(c.env.DB, id);
  if (!spot) return c.json({ error: "not_found" }, 404);
  if (!(await canEdit(c, spot))) return c.json({ error: "forbidden" }, 403);
  const parsed = patchOwnSpot.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const p = parsed.data;
  if ((p.lat === undefined) !== (p.lng === undefined)) return c.json({ error: "lat_lng_together" }, 400);
  if (p.types) {
    const typeError = await checkTypes(c.env.DB, p.types, p.other_text);
    if (typeError) return c.json({ error: typeError }, 400);
  }
  const db = c.env.DB;
  const sets: string[] = ["updated_at = ?2"];
  const binds: unknown[] = [id, new Date().toISOString()];
  const set = (col: string, value: unknown) => { binds.push(value); sets.push(`${col} = ?${binds.length}`); };
  if (p.lat !== undefined && p.lng !== undefined) {
    const approx = p.is_approximate ?? false;
    set("lat", approx ? round3(p.lat) : p.lat);
    set("lng", approx ? round3(p.lng) : p.lng);
    set("location_source", "pin");
  }
  if (p.is_approximate !== undefined) set("is_approximate", p.is_approximate ? 1 : 0);
  // marking a spot approximate must also coarsen the stored point, not just flag it
  if (p.is_approximate === true && p.lat === undefined) sets.push("lat = ROUND(lat, 3)", "lng = ROUND(lng, 3)");
  if (p.note !== undefined) set("note", p.note ?? null);
  if (p.other_text !== undefined) set("other_text", p.other_text ?? null);
  const statements: D1PreparedStatement[] = [];
  if (p.types) {
    statements.push(db.prepare("DELETE FROM spot_types WHERE spot_id = ?1").bind(id));
    for (const slug of new Set(p.types)) statements.push(db.prepare("INSERT INTO spot_types (spot_id, type_slug) VALUES (?1, ?2)").bind(id, slug));
  }
  await db.batch([
    db.prepare(`UPDATE spots SET ${sets.join(", ")} WHERE id = ?1`).bind(...binds),
    ...statements,
    db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES ('submitter', 'update', 'spot', ?1, ?2)").bind(id, JSON.stringify(p)),
  ]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id });
});

spots.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const spot = await loadEditable(c.env.DB, id);
  if (!spot) return c.json({ error: "not_found" }, 404);
  if (!(await canEdit(c, spot))) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE spots SET status = 'hidden', updated_at = ?2 WHERE id = ?1").bind(id, new Date().toISOString()),
    c.env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ('submitter', 'hide', 'spot', ?1)").bind(id),
  ]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id });
});

spots.post("/:id/report", async (c) => {
  const parsed = reportBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  if (!(await verifyTurnstile(c.env, parsed.data.turnstile_token, clientIp(c.req.raw), new URL(c.req.url).hostname))) return c.json({ error: "turnstile_failed" }, 403);
  const id = c.req.param("id");
  const reason = "reported";
  const res = await c.env.DB.prepare(
    `UPDATE spots SET needs_review = 1,
       review_reason = CASE WHEN review_reason IS NULL OR review_reason = '' THEN ?2 WHEN instr(review_reason, ?2) > 0 THEN review_reason ELSE review_reason || ',' || ?2 END,
       updated_at = ?3 WHERE id = ?1 AND status = 'published'`,
  ).bind(id, reason, new Date().toISOString()).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES ('submitter', 'report', 'spot', ?1, ?2)")
    .bind(id, JSON.stringify({ reason, note: parsed.data.note ?? null })).run();
  return c.json({ id });
});
