import { Hono } from "hono";
import type { AppEnv } from "../app";

export const media = new Hono<AppEnv>();

const IMMUTABLE = "public, max-age=31536000, immutable";

/** `bytes=0-99`, `bytes=100-` or `bytes=-500` (the only forms browsers send); null when it is not a single valid range. */
export function parseRange(header: string | undefined, size: number): { offset: number; length: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || start >= size || end < start) return "invalid";
  return { offset: start, length: end - start + 1 };
}

async function sightingVideoIsPublic(db: D1Database, id: string, key: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT s.status AS spot_status, x.status_review AS review, x.video_key AS video_key FROM sightings x JOIN spots s ON s.id = x.spot_id WHERE x.id = ?1")
    .bind(id)
    .first<{ spot_status: string; review: string; video_key: string | null }>();
  return !!row && row.spot_status === "published" && (row.review === "auto" || row.review === "approved") && row.video_key === key;
}

// iOS Safari will not play a video without HTTP Range support, so this streams from R2 with 206 Partial Content.
media.on(["GET", "HEAD"], "/video/:file", async (c) => {
  const m = /^([0-9A-Z]{26})\.(mp4|mov)$/.exec(c.req.param("file"));
  if (!m) return new Response("Not found", { status: 404 });
  const [, id, ext] = m;
  // Videos of spots that are hidden, deleted or awaiting approval are not public. Neither is an original the browser could not convert:
  // it may still carry the phone's location, so it waits for scripts/transcode-pending.ts (ffmpeg strips the metadata).
  const key = `video/${id}.${ext}`;
  const spot = await c.env.DB.prepare("SELECT status, video_key, video_needs_transcode AS raw FROM spots WHERE id = ?1").bind(id).first<{ status: string; video_key: string | null; raw: number }>();
  const ok = spot
    ? spot.status === "published" && spot.video_key === key && spot.raw === 0
    : await sightingVideoIsPublic(c.env.DB, id!, key);
  if (!ok) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const head = await c.env.PHOTOS.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const range = parseRange(c.req.header("Range"), head.size);
  const headers = new Headers();
  head.writeHttpMetadata(headers);
  headers.set("ETag", head.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", IMMUTABLE);
  headers.set("X-Content-Type-Options", "nosniff");
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (c.req.header("If-None-Match") === head.httpEtag && !range) return new Response(null, { status: 304, headers });

  const object = await c.env.PHOTOS.get(key, range ? { range } : undefined);
  if (!object) return new Response("Not found", { status: 404 });
  const body = "body" in object ? object.body : null;
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(c.req.method === "HEAD" ? null : body, { status: 206, headers });
  }
  headers.set("Content-Length", String(head.size));
  return new Response(c.req.method === "HEAD" ? null : body, { status: 200, headers });
});
