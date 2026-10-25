import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucket, call, db, MP4, mockTurnstile, resetState, spotForm, WEBP } from "./helpers";
import { parseRange } from "../../worker/routes/media";

beforeEach(async () => {
  await resetState();
  await db().prepare("UPDATE settings SET value = 'on' WHERE key = 'feature_video'").run();
});
afterEach(() => vi.restoreAllMocks());

async function create(input: Parameters<typeof spotForm>[0]) {
  const res = await call("/api/spots", { method: "POST", body: spotForm(input) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("F1 video upload", () => {
  it("is refused while the feature is off", async () => {
    mockTurnstile(true);
    await db().prepare("UPDATE settings SET value = 'off' WHERE key = 'feature_video'").run();
    const { res, body } = await create({ meta: {}, video: MP4() });
    expect(res.status).toBe(403);
    expect(body.error).toBe("feature_off");
  });

  it("stores the clip and the poster, and exposes them with the spot", async () => {
    mockTurnstile(true);
    const { res, body } = await create({ meta: { video_duration_ms: 12_000, video_w: 720, video_h: 1280 }, video: MP4(4096), videoPoster: WEBP(300) });
    expect(res.status).toBe(201);
    const id = body.id as string;
    expect(await bucket().head(`video/${id}.mp4`)).not.toBeNull();
    expect(await bucket().head(`display/${id}-poster.webp`)).not.toBeNull();
    const detail = (await (await call(`/api/spots/${id}`)).json()) as { v?: string; video?: { src: string; poster: string; duration_ms: number; w: number; h: number } };
    expect(detail.v).toBe("mp4");
    expect(detail.video).toEqual({ src: `/media/video/${id}.mp4`, poster: `/img/display/${id}-poster.webp`, duration_ms: 12_000, w: 720, h: 1280 });
    const list = (await (await call("/api/spots")).json()) as { features: { id: string; properties: { v?: string } }[] };
    expect(list.features.find((f) => f.id === id)?.properties.v).toBe("mp4");
    const meter = await db().prepare("SELECT value FROM settings WHERE key = 'r2_bytes'").first<{ value: string }>();
    expect(Number(meter!.value)).toBeGreaterThanOrEqual(4096);
  });

  it("a video without a photo uses its poster (display + thumb) as the spot's photo", async () => {
    mockTurnstile(true);
    const { res, body } = await create({ meta: {}, video: MP4() });
    expect(res.status).toBe(201);
    const row = await db().prepare("SELECT photo_key, video_poster_key FROM spots WHERE id = ?1").bind(body.id).first<{ photo_key: string; video_poster_key: string }>();
    expect(row!.video_poster_key).toBe(row!.photo_key);
    expect((await create({ meta: {}, display: null, thumb: null, video: MP4() })).res.status).toBe(400);
  });

  it("rejects what is not an MP4 and refuses videos when storage is nearly full", async () => {
    mockTurnstile(true);
    expect((await create({ meta: {}, video: new Uint8Array(200).fill(1) })).res.status).toBe(415);
    await db().prepare("UPDATE settings SET value = '8589934592' WHERE key = 'r2_bytes'").run();
    const full = await create({ meta: {}, video: MP4() });
    expect(full.res.status).toBe(507);
    expect(full.body.error).toBe("storage_full_video");
    expect((await create({ meta: {} })).res.status).toBe(201); // photos still go through
  });

  it("flags the untranscoded fallback for review", async () => {
    mockTurnstile(true);
    const { body } = await create({ meta: { video_needs_transcode: true }, video: MP4(512, "qt  ") });
    const row = await db().prepare("SELECT video_key, video_needs_transcode AS n, needs_review, review_reason FROM spots WHERE id = ?1").bind(body.id).first();
    expect(row).toEqual({ video_key: `video/${body.id}.mov`, n: 1, needs_review: 1, review_reason: "video_needs_transcode" });
  });
});

describe("GET /media/video (HTTP Range)", () => {
  async function published() {
    mockTurnstile(true);
    const { body } = await create({ meta: {}, video: MP4(1000), videoPoster: WEBP() });
    return body.id as string;
  }

  it("streams the whole file and advertises ranges", async () => {
    const id = await published();
    const res = await call(`/media/video/${id}.mp4`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it("answers byte ranges with 206 and a Content-Range", async () => {
    const id = await published();
    const res = await call(`/media/video/${id}.mp4`, { headers: { Range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect((await res.arrayBuffer()).byteLength).toBe(100);
    const tail = await call(`/media/video/${id}.mp4`, { headers: { Range: "bytes=-50" } });
    expect(tail.headers.get("Content-Range")).toBe("bytes 950-999/1000");
    const open = await call(`/media/video/${id}.mp4`, { headers: { Range: "bytes=900-" } });
    expect((await open.arrayBuffer()).byteLength).toBe(100);
    expect((await call(`/media/video/${id}.mp4`, { headers: { Range: "bytes=5000-" } })).status).toBe(416);
  });

  it("does not serve a hidden spot", async () => {
    const id = await published();
    await db().prepare("UPDATE spots SET status = 'hidden' WHERE id = ?1").bind(id).run();
    expect((await call(`/media/video/${id}.mp4`)).status).toBe(404);
    expect((await call(`/media/video/${id}.mov`)).status).toBe(404);
    expect((await call("/media/video/../etc.mp4")).status).toBe(404);
  });
});

describe("parseRange", () => {
  it("handles the three forms and rejects the rest", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10 });
    expect(parseRange("bytes=90-", 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange("bytes=-10", 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange("bytes=0-9999", 100)).toEqual({ offset: 0, length: 100 });
    for (const bad of ["bytes=100-", "bytes=5-2", "bytes=-", "bytes=a-b", "items=0-1", "bytes=0-1,5-6"]) expect(parseRange(bad, 100)).toBe("invalid");
  });
});
