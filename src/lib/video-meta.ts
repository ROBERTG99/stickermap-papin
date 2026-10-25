/** Pure helpers for F1 video: the trim window and the location some phones write into the container (no mediabunny here, so they are unit tested). */

export const VIDEO_MAX_MS = 15_000;
/** Fallback upload of an untranscoded clip (browser that cannot encode H.264): up to 50 MB and 20 s. */
export const FALLBACK_MAX_BYTES = 50 * 1024 * 1024;
export const FALLBACK_MAX_MS = 20_000;
export const LONG_EDGE = 1280;
export const VIDEO_BITRATE = 2_500_000;
export const AUDIO_BITRATE = 96_000;
export const MAX_FPS = 30;

export interface TrimWindow { startMs: number; endMs: number }

/** Default window: the first 15 s of the clip. */
export function defaultWindow(durationMs: number): TrimWindow {
  return { startMs: 0, endMs: Math.min(durationMs, VIDEO_MAX_MS) };
}

/** Keep a window inside the clip and at most 15 s long; moving one end pushes the other when needed. */
export function clampWindow(w: TrimWindow, durationMs: number, moved: "start" | "end"): TrimWindow {
  let { startMs, endMs } = w;
  startMs = Math.max(0, Math.min(startMs, durationMs - 500));
  endMs = Math.min(durationMs, Math.max(endMs, 500));
  if (moved === "start") {
    if (endMs - startMs > VIDEO_MAX_MS) endMs = startMs + VIDEO_MAX_MS;
    if (endMs - startMs < 500) endMs = Math.min(durationMs, startMs + 500);
  } else {
    if (endMs - startMs > VIDEO_MAX_MS) startMs = endMs - VIDEO_MAX_MS;
    if (endMs - startMs < 500) startMs = Math.max(0, endMs - 500);
  }
  return { startMs: Math.round(startMs), endMs: Math.round(endMs) };
}

/** `42` -> `0:42`, `75.4` -> `1:15`. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Output size with the long edge capped at `LONG_EDGE`; the short edge keeps the aspect ratio and stays even (H.264 needs even sizes). */
export function outputSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, LONG_EDGE / Math.max(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export interface VideoLocation { lat: number; lng: number }

/**
 * ISO 6709 as phones write it: `+40.7642-073.9787/` or `+40.7642-073.9787+012.000/` (altitude ignored).
 * Returns null for anything out of range or the 0,0 "null island".
 */
export function parseIso6709(text: string): VideoLocation | null {
  const m = /^\s*([+-]\d{1,3}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

const LOCATION_KEYS = ["com.apple.quicktime.location.iso6709", "location.iso6709", "©xyz", "xyz", "location"];

/** Look through the container's raw metadata tags for a location (best effort: messaging apps often strip it). */
export function locationFromRawTags(raw: Record<string, unknown> | undefined): VideoLocation | null {
  if (!raw) return null;
  const entries = Object.entries(raw);
  for (const wanted of LOCATION_KEYS) {
    for (const [key, value] of entries) {
      if (key.toLowerCase() !== wanted.toLowerCase()) continue;
      const text = typeof value === "string" ? value : value instanceof Uint8Array ? new TextDecoder().decode(value) : null;
      // `udta/©xyz` payloads start with a 4-byte size+language header
      const found = text ? parseIso6709(text) ?? parseIso6709(text.replace(/^[^+-]+/, "")) : null;
      if (found) return found;
    }
  }
  return null;
}
