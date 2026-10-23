import type { WhoPlacedValue } from "../../components/WhoPlaced";
import { MAX } from "../../shared/schema";
import { effectiveCoords } from "./classify";
import type { BulkDefaults, PhotoMeta } from "./types";

/** Types of one photo: its own override, else the batch default. */
export const effectiveTypes = (p: Pick<PhotoMeta, "override">, d: Pick<BulkDefaults, "types">): string[] => p.override.types ?? d.types;
export const effectiveOtherText = (p: Pick<PhotoMeta, "override">, d: Pick<BulkDefaults, "otherText">): string => p.override.otherText ?? d.otherText;
export const effectivePlacer = (p: Pick<PhotoMeta, "override">, d: Pick<BulkDefaults, "placer">): WhoPlacedValue => p.override.placer ?? d.placer;

/** Naive `2023-08-02T10:31:01` -> `10:31`. */
export const clockOf = (takenAt: string | null): string | null => (takenAt && takenAt.length >= 16 ? takenAt.slice(11, 16) : null);

/** The `meta` JSON of `POST /api/spots` for one photo of a batch (`client_ref` = the photo id; no Turnstile token). */
export function buildSpotMeta(photo: PhotoMeta, d: BulkDefaults, allowsText: (slug: string) => boolean): Record<string, unknown> | null {
  const { lat, lng } = effectiveCoords(photo);
  if (lat === null || lng === null) return null;
  const types = effectiveTypes(photo, d);
  const reporter = d.soy.trim() || null;
  const placer = effectivePlacer(photo, d);
  const status = placer.status === "self" && !reporter ? "unknown" : placer.status;
  const other = effectiveOtherText(photo, d).trim().slice(0, MAX.otherText);
  const note = photo.override.note?.trim().slice(0, MAX.note);
  const placerNote = status === "unknown" ? placer.note?.trim().slice(0, MAX.placerNote) : undefined;
  return {
    lat,
    lng,
    location_source: photo.placed ? photo.placed.source : "exif",
    location_accuracy_m: photo.placed ? null : photo.accuracyM,
    is_approximate: d.approximate,
    types,
    other_text: types.some(allowsText) && other ? other : null,
    reporter,
    placer_status: status,
    placers: status === "other" ? placer.placers : [],
    placer_note: placerNote || null,
    note: note || null,
    taken_at: photo.takenAt,
    photo_sha256: photo.sha256,
    client_ref: photo.id,
  };
}

/** What needs fixing before "Mandale Mecha", in the order the page shows it; null when the batch can go. */
export type BulkProblem = "type" | "other" | "placer" | "none";

export function batchProblem(d: BulkDefaults, ready: number, allowsText: (slug: string) => boolean): BulkProblem | null {
  if (d.types.length === 0) return "type";
  if (d.types.some(allowsText) && !d.otherText.trim()) return "other";
  if (d.placer.status === "other" && d.placer.placers.length === 0) return "placer";
  if (ready === 0) return "none";
  return null;
}
