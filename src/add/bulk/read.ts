import { parse as parseExif } from "exifr/dist/lite.esm.mjs";
import { DISPLAY_EDGE, THUMB_EDGE, decode, exifDateToNaive, resizeBitmap, sha256Hex, validGps, type PhotoExif, type ProcessedPhoto } from "../../lib/photo";
import { MAX } from "../../shared/schema";
import { newUlid } from "../../shared/ulid";
import { putBlobs } from "./draft-idb";
import type { PhotoMeta, ReadErrorCode } from "./types";

const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

export const isImageFile = (f: File): boolean => f.type.startsWith("image/") || IMAGE_NAME.test(f.name);

/** iPhone/iPad Safari (also iPadOS posing as a Mac). Safari's memory limit makes reading 1 photo at a time safer. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * EXIF of one photo. `lib/photo.ts` `readExif` asks exifr's lite build for `pick: [...]`, which throws there ("undefined is not
 * iterable") and is swallowed into "no location", so every photo would look like it has no GPS. Reading everything with
 * `gps: true` works and also yields GPSHPositioningError.
 */
export async function readExifFully(file: Blob): Promise<PhotoExif> {
  try {
    const tags = (await parseExif(file, { gps: true, reviveValues: false })) as
      { latitude?: number; longitude?: number; GPSHPositioningError?: unknown; DateTimeOriginal?: unknown } | undefined;
    const ok = validGps(tags?.latitude, tags?.longitude);
    const acc = tags?.GPSHPositioningError;
    return {
      lat: ok ? tags!.latitude! : null,
      lng: ok ? tags!.longitude! : null,
      accuracyM: ok && typeof acc === "number" && Number.isFinite(acc) && acc >= 0 ? acc : null,
      takenAt: exifDateToNaive(tags?.DateTimeOriginal),
    };
  } catch {
    return { lat: null, lng: null, accuracyM: null, takenAt: null };
  }
}

/** Same pipeline as `lib/photo.ts` `processPhoto` (SHA-256, decode with orientation, 1600/400 WebP) with the EXIF read above. */
async function processLocal(file: File): Promise<ProcessedPhoto> {
  const [exif, sha256] = await Promise.all([readExifFully(file), sha256Hex(file)]);
  const bitmap = await decode(file);
  if (!bitmap) return { sha256, exif, display: null, thumb: null, decoded: false };
  try {
    const display = await resizeBitmap(bitmap, DISPLAY_EDGE, 0.8, 1_450_000);
    const thumb = await resizeBitmap(bitmap, THUMB_EDGE, 0.7, 190_000);
    return { sha256, exif, display, thumb, decoded: true };
  } finally {
    bitmap.close();
  }
}

function blankPhoto(file: File, seq: number): PhotoMeta {
  return {
    id: newUlid(), seq, name: file.name, size: file.size, sha256: null, lat: null, lng: null, accuracyM: null, takenAt: null,
    error: null, hasOriginal: false, existsId: null, placed: null, omitted: false, override: {}, upload: { state: "idle" },
  };
}

const failed = (p: PhotoMeta, error: ReadErrorCode): PhotoMeta => ({ ...p, error });

/**
 * Local-only: EXIF -> SHA-256 -> 1600/400 derivatives (`processPhoto`), then the blobs go to the IndexedDB draft right away and
 * only the small metadata comes back. Nothing is uploaded here.
 */
export async function readOne(draftId: string, file: File, seq: number): Promise<{ meta: PhotoMeta; thumb: Blob | null }> {
  const base = blankPhoto(file, seq);
  if (!isImageFile(file)) return { meta: failed(base, "not-image"), thumb: null };
  if (file.size > MAX.originalBytes) return { meta: failed(base, "too-big"), thumb: null };
  try {
    const p = await processLocal(file);
    const meta: PhotoMeta = { ...base, sha256: p.sha256, lat: p.exif.lat, lng: p.exif.lng, accuracyM: p.exif.accuracyM, takenAt: p.exif.takenAt };
    // HEIC/HEIF outside Safari is a format problem; any other undecodable file is simply unreadable.
    if (!p.decoded || !p.display || !p.thumb) return { meta: failed(meta, /hei[cf]/i.test(`${file.type} ${file.name}`) ? "cant-open" : "cant-read"), thumb: null };
    const blobs = { thumb: p.thumb.blob, display: p.display.blob };
    try {
      await putBlobs(draftId, meta.id, { ...blobs, original: file });
      return { meta: { ...meta, hasOriginal: true }, thumb: blobs.thumb };
    } catch {
      // The original did not fit (quota): the photo still goes up with its display image and thumbnail.
      try {
        await putBlobs(draftId, meta.id, { ...blobs, original: null });
        return { meta, thumb: blobs.thumb };
      } catch {
        return { meta: failed(meta, "no-space"), thumb: null };
      }
    }
  } catch {
    return { meta: failed(base, "cant-read"), thumb: null };
  }
}

export interface ReadHooks {
  onPhoto: (meta: PhotoMeta, thumb: Blob | null) => void;
  onProgress: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Read `files` with `concurrency` workers (2; 1 on iOS). Resolves when every file was read or the signal aborted. */
export async function readFiles(draftId: string, files: readonly File[], hooks: ReadHooks, concurrency = isIos() ? 1 : 2): Promise<void> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (!hooks.signal?.aborted) {
      const i = next++;
      const file = files[i];
      if (!file) return;
      const { meta, thumb } = await readOne(draftId, file, i);
      hooks.onPhoto(meta, thumb);
      hooks.onProgress(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}
