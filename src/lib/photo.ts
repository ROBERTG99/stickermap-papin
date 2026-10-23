/**
 * Client-side photo pipeline shared by the single add flow and bulk add (BUILD.md §7.3, §7.3b):
 * EXIF (GPS, date, accuracy) -> SHA-256 of the original -> decode with orientation -> 1600 px and 400 px derivatives.
 * Re-encoding through a canvas strips every metadata block, so served images never carry GPS.
 */
import { parse as parseExif } from "exifr/dist/lite.esm.mjs";

export interface PhotoExif {
  lat: number | null;
  lng: number | null;
  /** GPSHPositioningError in metres, when the camera wrote it. */
  accuracyM: number | null;
  /** DateTimeOriginal as naive local time `YYYY-MM-DDTHH:MM:SS`. */
  takenAt: string | null;
}

export interface Derivative { blob: Blob; width: number; height: number }

export interface ProcessedPhoto {
  sha256: string;
  exif: PhotoExif;
  display: Derivative | null;
  thumb: Derivative | null;
  /** False when the browser cannot decode the file (HEIC outside Safari): upload the original and let an admin review. */
  decoded: boolean;
}

export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;
const DISPLAY_MAX_BYTES = 1_450_000;

/** A GPS fix counts only inside the valid ranges and away from the 0,0 "null island" some cameras write. */
export function validGps(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** EXIF `2023:08:02 10:31:01` -> `2023-08-02T10:31:01`. */
export function exifDateToNaive(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

export async function readExif(file: Blob): Promise<PhotoExif> {
  try {
    // The lite build rejects `pick` together with `gps: true`; naming the segments and tags works and still skips the rest of the file.
    const options = {
      tiff: false, xmp: false, icc: false, iptc: false, jfif: false, ifd1: false, interop: false,
      exif: ["DateTimeOriginal"],
      gps: ["GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef", "GPSHPositioningError"],
      reviveValues: false, translateValues: false, mergeOutput: true,
    };
    const tags = (await parseExif(file, options as never)) as
      { latitude?: number; longitude?: number; GPSHPositioningError?: number; DateTimeOriginal?: unknown } | undefined;
    const ok = validGps(tags?.latitude, tags?.longitude);
    return {
      lat: ok ? tags!.latitude! : null,
      lng: ok ? tags!.longitude! : null,
      accuracyM: ok && typeof tags?.GPSHPositioningError === "number" ? tags.GPSHPositioningError : null,
      takenAt: exifDateToNaive(tags?.DateTimeOriginal),
    };
  } catch {
    return { lat: null, lng: null, accuracyM: null, takenAt: null };
  }
}

export async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasFor(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

async function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Scale to `edge` on the long side and encode as WebP (JPEG where the browser cannot encode WebP, e.g. Safari). */
export async function resizeBitmap(bitmap: ImageBitmap, edge: number, quality: number, maxBytes?: number): Promise<Derivative> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = canvasFor(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  let q = quality;
  for (;;) {
    let blob = await toBlob(canvas, "image/webp", q);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", Math.min(q + 0.02, 0.9));
    if (!blob) throw new Error("encode failed");
    if (!maxBytes || blob.size <= maxBytes || q <= 0.45) return { blob, width, height };
    q -= 0.1;
  }
}

/** Decode honouring EXIF orientation; null when the browser cannot decode the file. */
export async function decode(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const [exif, sha256] = await Promise.all([readExif(file), sha256Hex(file)]);
  const bitmap = await decode(file);
  if (!bitmap) return { sha256, exif, display: null, thumb: null, decoded: false };
  try {
    const display = await resizeBitmap(bitmap, DISPLAY_EDGE, 0.8, DISPLAY_MAX_BYTES);
    const thumb = await resizeBitmap(bitmap, THUMB_EDGE, 0.7, 190_000);
    return { sha256, exif, display, thumb, decoded: true };
  } finally {
    bitmap.close();
  }
}
