import { validGps } from "../../lib/photo";
import type { PhotoMeta, ReadErrorCode } from "./types";

/** BUILD.md §7.3b status table. `omitted` is the user's own "Omitir". */
export type PhotoStatus = "ready" | "no-location" | "exists" | "dup-batch" | "error" | "omitted";

/** The slice of a photo the classifier needs; `lat`/`lng` are the effective coordinates (hand-placed pin wins over EXIF). */
export interface ClassifyInput {
  sha256: string | null;
  lat: number | null;
  lng: number | null;
  error: ReadErrorCode | null;
  existsId: string | null;
  omitted?: boolean;
}

export interface Classification {
  status: PhotoStatus;
  /** For `dup-batch`: index (in the input order) of the first photo with the same hash. */
  sameAs?: number;
}

/** A location counts only inside valid ranges and away from 0,0. */
export function hasLocation(lat: number | null, lng: number | null): boolean {
  return validGps(lat, lng);
}

/**
 * Classify a batch, in read order (the first photo of a repeated hash is the one that is kept).
 * Precedence: unreadable > already on the map > repeated in the batch > no location > ready; the user's "Omitir" wins over
 * ready and no-location only (the automatic skips keep their own explanation).
 * A photo without GPS is never given a location here: only a hand-placed pin (already folded into `lat`/`lng`) makes it ready.
 */
export function classifyPhotos(photos: readonly ClassifyInput[]): Classification[] {
  const firstByHash = new Map<string, number>();
  const onMap = new Set(photos.flatMap((p) => (p.existsId && p.sha256 ? [p.sha256] : [])));
  return photos.map((p, i) => {
    if (p.error) return { status: "error" };
    if (p.existsId || (p.sha256 && onMap.has(p.sha256))) return { status: "exists" };
    if (p.sha256) {
      const first = firstByHash.get(p.sha256);
      if (first !== undefined) return { status: "dup-batch", sameAs: first };
      firstByHash.set(p.sha256, i);
    }
    if (p.omitted) return { status: "omitted" };
    return { status: hasLocation(p.lat, p.lng) ? "ready" : "no-location" };
  });
}

/** Coordinates used for a photo: the hand-placed pin, else its own EXIF fix. Never the device or another photo. */
export function effectiveCoords(p: Pick<PhotoMeta, "lat" | "lng" | "placed">): { lat: number | null; lng: number | null } {
  return p.placed ? { lat: p.placed.lat, lng: p.placed.lng } : { lat: p.lat, lng: p.lng };
}

/** Photos sent or already on the server no longer take part in the review. */
export const isUploaded = (p: Pick<PhotoMeta, "upload">): boolean => p.upload.state === "done" || p.upload.state === "exists";

/** Classify the whole draft; a photo that already went up counts as "on the map", so a later copy of it is not offered again. */
export function classifyMetas(photos: readonly PhotoMeta[]): Classification[] {
  return classifyPhotos(
    photos.map((p) => ({
      ...effectiveCoords(p), sha256: p.sha256, error: p.error, omitted: p.omitted,
      existsId: p.existsId ?? (isUploaded(p) ? (p.upload.spotId ?? "uploaded") : null),
    })),
  );
}

export interface DraftSummary {
  unplaced: number;
  unfinished: { done: number; total: number } | null;
}

/** What the map announces ("Tenés 3 fotos sin ubicar", "Lote sin terminar: 28 de 46 subidas"). */
export function summarizeDraft(phase: string, photos: readonly PhotoMeta[], sendNo?: number): DraftSummary {
  const live = photos.filter((p) => !isUploaded(p));
  const classes = classifyMetas(photos);
  let unplaced = 0;
  photos.forEach((p, i) => {
    if (!isUploaded(p) && classes[i]?.status === "no-location") unplaced++;
  });
  const sent = photos.filter((p) => p.upload.state !== "idle" && (sendNo === undefined || p.upload.send === sendNo));
  const pending = live.filter((p) => p.upload.state === "queued" || p.upload.state === "failed");
  const unfinished = phase === "uploading" && pending.length > 0 ? { done: sent.length - pending.length, total: sent.length } : null;
  return { unplaced, unfinished };
}
