import { Hono } from "hono";
import { haversineMeters } from "../../src/shared/geo";
import { FRESH_PHOTO_MS, VERIFY_RADIUS_M } from "../../src/shared/life";
import { MAX, sightingMeta } from "../../src/shared/schema";
import { newUlid } from "../../src/shared/ulid";
import type { SightingView } from "../../src/shared/types";
import type { AppEnv } from "../app";
import { bustSpotsCache } from "../lib/cache";
import { featureEnabled } from "../lib/features";
import { CONTENT_TYPE, EXTENSION, VIDEO_CONTENT_TYPE } from "../lib/images";
import { refreshLife } from "../lib/life";
import { findOrCreatePerson } from "../lib/people";
import { allowed, ipHash, record } from "../lib/ratelimit";
import { meterStatement, putAll, type PutObject } from "../lib/r2";
import { settingsMap } from "../lib/settings";
import { verifyTurnstile } from "../lib/turnstile";
import { readImage, readVideo, type CheckedFile } from "../lib/uploads";

/** Mounted at `/api/spots/:id/sightings` (F4). */
export const sightings = new Hono<AppEnv>();

const img = (key: string | null) => (key ? `/img/${key}` : null);

sightings.get("/", async (c) => {
  const id = c.req.param("id") ?? "";
  const spot = await c.env.DB.prepare("SELECT id FROM spots WHERE id = ?1 AND status = 'published'").bind(id).first();
  if (!spot) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare(
      `SELECT x.id, x.status, x.created_at, x.verified, x.status_review AS review, x.note, x.photo_key, x.thumb_key, x.video_key, x.video_poster_key,
              x.video_duration_ms, x.video_w, x.video_h, p.display_name AS reporter
         FROM sightings x LEFT JOIN people p ON p.id = x.reporter_person_id
        WHERE x.spot_id = ?1 AND x.status_review != 'rejected' ORDER BY x.created_at DESC LIMIT 100`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  const body: SightingView[] = results.map((r) => ({
    id: r.id as string,
    status: r.status as SightingView["status"],
    created_at: r.created_at as string,
    verified: r.verified === 1 || r.review === "approved",
    pending: r.review === "pending",
    reporter: (r.reporter as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    photo: img(r.photo_key as string | null),
    thumb: img(r.thumb_key as string | null),
    video: typeof r.video_key === "string"
      ? { src: `/media/${r.video_key}`, poster: img((r.video_poster_key as string | null) ?? null), duration_ms: (r.video_duration_ms as number | null) ?? null, w: (r.video_w as number | null) ?? null, h: (r.video_h as number | null) ?? null }
      : null,
  }));
  return c.json(body, 200, { "Cache-Control": "public, max-age=60" });
});

sightings.post("/", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > MAX.videoBytes + MAX.displayBytes + MAX.thumbBytes + 200_000) return c.json({ error: "too_large" }, 413);
  const spotId = c.req.param("id") ?? "";
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "bad_request" }, 400);
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("meta") ?? "")); } catch { return c.json({ error: "bad_meta" }, 400); }
  const parsed = sightingMeta.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const meta = parsed.data;
  if ((meta.lat === null || meta.lat === undefined) !== (meta.lng === null || meta.lng === undefined)) return c.json({ error: "lat_lng_together" }, 400);

  const db = c.env.DB;
  const settings = await settingsMap(db);
  if (!(await featureEnabled(c.env, c.req.raw, settings, "sightings"))) return c.json({ error: "feature_off" }, 403);
  const clientIp = c.req.header("CF-Connecting-IP");
  if (!(await verifyTurnstile(c.env, meta.turnstile_token, clientIp ?? null, new URL(c.req.url).hostname))) return c.json({ error: "turnstile_failed" }, 403);
  const ipH = await ipHash(c.env.IP_HASH_SECRET, clientIp ?? null);
  if (!(await allowed(db, ipH, "sighting"))) return c.json({ error: "rate_limited" }, 429);

  const spot = await db.prepare("SELECT id, lat, lng FROM spots WHERE id = ?1 AND status = 'published'").bind(spotId).first<{ id: string; lat: number; lng: number }>();
  if (!spot) return c.json({ error: "not_found" }, 404);

  const display = await readImage(form.get("display"), MAX.displayBytes, false);
  const thumb = await readImage(form.get("thumb"), MAX.thumbBytes, false);
  const video = await readVideo(form.get("video"));
  for (const f of [display, thumb]) {
    if (f === "too_large") return c.json({ error: "too_large" }, 413);
    if (f === "bad_image") return c.json({ error: "bad_image" }, 415);
  }
  if (video === "too_large") return c.json({ error: "too_large" }, 413);
  // sightings only take a clip the browser already converted: an untranscoded original may carry the phone's location
  if (video === "bad_video" || (video && video.kind !== "mp4")) return c.json({ error: "bad_video" }, 415);
  const d = display as CheckedFile | null;
  const t = thumb as CheckedFile | null;
  if (!!d !== !!t) return c.json({ error: "display_and_thumb_go_together" }, 400);
  for (const f of [d, t]) if (f && f.kind !== "webp" && f.kind !== "jpeg") return c.json({ error: "bad_image" }, 415);
  if (video && !d) return c.json({ error: "video_needs_poster" }, 400);
  if (video) {
    if (!(await featureEnabled(c.env, c.req.raw, settings, "video"))) return c.json({ error: "feature_off" }, 403);
    if (Number(settings.r2_bytes ?? 0) >= MAX.videoStorageCap) return c.json({ error: "storage_full_video" }, 507);
  }

  const id = newUlid();
  const now = new Date().toISOString();
  const hasPos = typeof meta.lat === "number" && typeof meta.lng === "number";
  const distance = hasPos ? haversineMeters(meta.lat as number, meta.lng as number, spot.lat, spot.lng) : null;
  const taken = meta.taken_at ? Date.parse(`${meta.taken_at}Z`) : null;
  // a naive local time has no zone: allow a day of slack either side
  const freshPhoto = !!d && taken !== null && Math.abs(Date.now() - taken) <= FRESH_PHOTO_MS + 86_400_000;
  const verified = (distance !== null && distance <= VERIFY_RADIUS_M) || freshPhoto;
  const review = settings.moderation_mode === "approval" ? "pending" : verified ? "auto" : "pending";

  const objects: PutObject[] = [];
  const photoKey = d ? `display/${id}.${EXTENSION[d.kind]}` : null;
  const thumbKey = t ? `thumb/${id}.${EXTENSION[t.kind]}` : null;
  if (d && t && photoKey && thumbKey) objects.push({ key: photoKey, body: d.bytes, contentType: CONTENT_TYPE[d.kind] }, { key: thumbKey, body: t.bytes, contentType: CONTENT_TYPE[t.kind] });
  const videoKey = video ? `video/${id}.mp4` : null;
  if (video && videoKey) objects.push({ key: videoKey, body: video.bytes, contentType: VIDEO_CONTENT_TYPE.mp4 });
  const reporterId = meta.reporter ? await findOrCreatePerson(db, meta.reporter) : null;
  const bytes = objects.reduce((n, x) => n + x.body.byteLength, 0);
  try {
    await putAll(c.env, objects);
  } catch {
    return c.json({ error: "storage_failed" }, 502);
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO sightings (id, spot_id, status, lat, lng, location_source, location_accuracy_m, distance_m, verified, via, photo_key, thumb_key, video_key, video_poster_key,
           video_duration_ms, video_w, video_h, reporter_person_id, reporter_raw, note, created_at, status_review, submitter_ip_hash)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)`,
      )
      .bind(
        id, spotId, meta.status, hasPos ? meta.lat : null, hasPos ? meta.lng : null, hasPos ? "device" : null, hasPos ? (meta.location_accuracy_m ?? null) : null, distance,
        verified ? 1 : 0, meta.via, photoKey, thumbKey, videoKey, video ? photoKey : null, video ? (meta.video_duration_ms ?? null) : null, video ? (meta.video_w ?? null) : null,
        video ? (meta.video_h ?? null) : null, reporterId, meta.reporter ?? null, meta.note ?? null, now, review, ipH,
      ),
    db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES ('submitter', 'sighting', 'spot', ?1, ?2)").bind(spotId, JSON.stringify({ sighting: id, status: meta.status, verified })),
  ];
  if (bytes > 0) statements.push(meterStatement(db, bytes));
  try {
    await db.batch(statements);
  } catch (error) {
    await c.env.PHOTOS.delete(objects.map((x) => x.key));
    throw error;
  }
  await record(db, ipH, "sighting");
  const life = await refreshLife(db, spotId);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id, verified, pending: review === "pending", life: life?.status ?? null }, 201);
});
