import type { Context } from "hono";
import type { AppEnv } from "../app";
import { sha256Hex } from "./crypto";

const SPOTS_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=600";

/**
 * Serve a public JSON document from the edge cache (BUILD.md §4.1): most map loads cost zero D1 reads.
 * `build` runs on a miss and returns the body plus a weak ETag derived from MAX(updated_at) and the row count.
 * Note: the Cache API is a no-op on *.workers.dev; browsers still cache through max-age.
 */
export async function cachedJson(c: Context<AppEnv>, build: () => Promise<{ body: unknown; etag: string }>, cacheControl = SPOTS_CACHE_CONTROL): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(c.req.url, { method: "GET" });
  const hit = await cache.match(key);
  const respondFrom = (res: Response) => {
    const etag = res.headers.get("ETag");
    if (etag && c.req.header("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
    return res;
  };
  // responses coming out of the cache have immutable headers; copy so middleware can still add its own
  if (hit) return respondFrom(new Response(hit.body, hit));
  const built = await build();
  const body = built.body;
  // header values must be ASCII, and person names are not: send a short digest of the logical version
  const etag = `W/"${(await sha256Hex(built.etag)).slice(0, 16)}"`;
  const res = new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": cacheControl, ETag: etag } });
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return respondFrom(res);
}

/** Drop the cached public documents after a write (spots, types, people, stats) so changes show at once. */
export async function bustSpotsCache(c: { req: { url: string } }): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default;
  await Promise.all(["/api/spots", "/api/types", "/api/people", "/api/stats"].map((p) => cache.delete(new Request(new URL(p, c.req.url).toString(), { method: "GET" }))));
}
