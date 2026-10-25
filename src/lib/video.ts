/**
 * F1 video, entirely in the browser (the Worker has 10 ms of CPU and never decodes video): probe the clip, convert it to
 * H.264 MP4 (long edge 1280 px, ~2.5 Mbps, 30 fps max, AAC 96 kbps) trimmed to a 15 s window, and grab a poster frame.
 * Mediabunny is lazy-loaded here, so nobody pays for it until a video is picked. Converting also drops the original's
 * metadata tags, so the served clip carries no location.
 */
import {
  AUDIO_BITRATE, FALLBACK_MAX_BYTES, FALLBACK_MAX_MS, MAX_FPS, VIDEO_BITRATE, VIDEO_MAX_MS, locationFromRawTags, outputSize,
  type TrimWindow, type VideoLocation,
} from "./video-meta";

export interface VideoProbe {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Location the container carries (best effort). */
  location: VideoLocation | null;
  /** Creation date as naive local `YYYY-MM-DDTHH:MM:SS`, when the container has one. */
  takenAt: string | null;
}

export interface VideoResult {
  blob: Blob;
  width: number;
  height: number;
  durationMs: number;
  /** The browser could not convert: the original goes up as it is and an admin transcodes it later. */
  needsTranscode: boolean;
}

const naive = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

const loadMediabunny = () => import("mediabunny");

/** Duration, size, audio, location and date. Throws when the container cannot be read at all. */
export async function probeVideo(file: File): Promise<VideoProbe> {
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("no_video_track");
    const [duration, width, height, audio, tags] = await Promise.all([
      input.computeDuration(), track.getDisplayWidth(), track.getDisplayHeight(), input.getPrimaryAudioTrack(), input.getMetadataTags().catch(() => ({} as { raw?: Record<string, unknown>; date?: Date })),
    ]);
    const date = tags.date instanceof Date && !Number.isNaN(tags.date.getTime()) ? tags.date : null;
    return {
      durationMs: Math.round(duration * 1000), width, height, hasAudio: audio !== null,
      location: locationFromRawTags(tags.raw), takenAt: date ? naive(date) : null,
    };
  } finally {
    input.dispose();
  }
}

/** Metadata through a `<video>` element, for containers Mediabunny cannot open (the clip can still go up untranscoded). */
export function probeWithElement(file: File): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      resolve({ durationMs: Math.round(v.duration * 1000), width: v.videoWidth, height: v.videoHeight, hasAudio: true, location: null, takenAt: null });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable_video")); };
    v.src = url;
  });
}

/** Can this browser encode H.264? (Old Safari and some Firefox builds cannot.) */
export async function canConvert(): Promise<boolean> {
  try {
    if (typeof VideoEncoder === "undefined") return false;
    const mb = await loadMediabunny();
    return await mb.canEncode("avc");
  } catch {
    return false;
  }
}

/** Convert and trim. Falls back to the original when the browser cannot encode and the clip is small enough. */
export async function convertVideo(file: File, probe: VideoProbe, window: TrimWindow, opts: { muted: boolean; onProgress?: (fraction: number) => void; signal?: AbortSignal }): Promise<VideoResult> {
  const lengthMs = window.endMs - window.startMs;
  if (!(await canConvert())) return fallback(file, probe, lengthMs);
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  try {
    const track = await input.getPrimaryVideoTrack();
    const fps = track ? (await track.computePacketStats(120).catch(() => null))?.averagePacketRate ?? 0 : 0;
    const size = outputSize(probe.width, probe.height);
    const conversion = await mb.Conversion.init({
      input, output,
      trim: { start: window.startMs / 1000, end: window.endMs / 1000 },
      video: {
        width: size.width, height: size.height, fit: "contain", codec: "avc", quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
        ...(fps > MAX_FPS ? { frameRate: MAX_FPS } : {}),
      },
      audio: opts.muted ? { discard: true } : { codec: "aac", quality: new mb.Quality({ bitrate: AUDIO_BITRATE }) },
      tags: () => ({}),
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error("conversion_invalid");
    conversion.onProgress = (p) => opts.onProgress?.(Math.min(1, Math.max(0, p)));
    opts.signal?.addEventListener("abort", () => void conversion.cancel(), { once: true });
    await conversion.execute();
    const bytes = target.buffer;
    if (!bytes) throw new Error("empty_output");
    return { blob: new Blob([bytes], { type: "video/mp4" }), width: size.width, height: size.height, durationMs: lengthMs, needsTranscode: false };
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    return fallback(file, probe, lengthMs);
  } finally {
    input.dispose();
  }
}

function fallback(file: File, probe: VideoProbe, lengthMs: number): VideoResult {
  if (file.size > FALLBACK_MAX_BYTES || probe.durationMs > FALLBACK_MAX_MS || lengthMs > VIDEO_MAX_MS + 5_000) throw new Error("cannot_convert");
  return { blob: file, width: probe.width, height: probe.height, durationMs: Math.min(probe.durationMs, FALLBACK_MAX_MS), needsTranscode: true };
}

/** One frame as a JPEG (the add form turns it into the spot's display and thumbnail like any photo). */
export async function posterFrame(video: Blob, atMs: number, maxEdge = 1600): Promise<Blob> {
  try {
    const mb = await loadMediabunny();
    const input = new mb.Input({ source: new mb.BlobSource(video), formats: mb.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("no_video_track");
      const w = await track.getDisplayWidth();
      const h = await track.getDisplayHeight();
      const k = Math.min(1, maxEdge / Math.max(w, h));
      const sink = new mb.CanvasSink(track, { width: Math.round(w * k), height: Math.round(h * k), fit: "contain" });
      const first = await track.getFirstTimestamp();
      const frame = await sink.getCanvas(first + atMs / 1000);
      if (!frame) throw new Error("no_frame");
      return await canvasToJpeg(frame.canvas);
    } finally {
      input.dispose();
    }
  } catch {
    return posterFromElement(video, atMs, maxEdge);
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("poster_failed"))), "image/jpeg", 0.88));
}

function posterFromElement(video: Blob, atMs: number, maxEdge: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(video);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const done = (fn: () => void) => { URL.revokeObjectURL(url); fn(); };
    v.onerror = () => done(() => reject(new Error("poster_failed")));
    v.onloadeddata = () => { v.currentTime = Math.min(atMs / 1000, Math.max(0, v.duration - 0.1)); };
    v.onseeked = () => {
      const k = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * k);
      canvas.height = Math.round(v.videoHeight * k);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(() => (b ? resolve(b) : reject(new Error("poster_failed")))), "image/jpeg", 0.88);
    };
    v.src = url;
  });
}
