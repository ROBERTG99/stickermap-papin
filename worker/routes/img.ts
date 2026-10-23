import { Hono } from "hono";
import type { AppEnv } from "../app";

export const img = new Hono<AppEnv>();

// Only these prefixes are public. `orig/`, `backups/` and anything else is never served (BUILD.md §8, §9).
const PUBLIC_PREFIXES = ["display/", "thumb/", "icons/"];
const IMMUTABLE = "public, max-age=31536000, immutable";
const ICON_CACHE = "public, max-age=86400";

img.on(["GET", "HEAD"], "/*", async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/img\//, ""));
  if (key.includes("..") || !PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return new Response("Not found", { status: 404 });
  const ifNoneMatch = c.req.header("If-None-Match");
  const object = await c.env.PHOTOS.get(key, { onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch.replace(/^W\//, "").replaceAll('"', "") } : undefined });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", key.startsWith("icons/") ? ICON_CACHE : IMMUTABLE);
  headers.set("X-Content-Type-Options", "nosniff");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(c.req.method === "HEAD" ? null : object.body, { headers });
});
