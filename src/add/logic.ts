/**
 * Pure rules of the add-sticker flow (BUILD.md §7.3): which photos are accepted, where the location comes from,
 * what blocks the submit button, what the request body looks like and how server errors map to friendly messages.
 * No DOM here, so every rule has a unit test.
 */
import type { CreateSpotMeta } from "../shared/schema";
import { haversineMeters, round3 } from "../shared/geo";
import type { LocationSource } from "../shared/types";

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
/** EXIF and device positions further apart than this ask the user which one is right. */
export const CONFLICT_KM = 50;
/** A "Sacar foto" picture is fresh when its EXIF date is this close to now. */
export const FRESH_PHOTO_MS = 10 * 60_000;
export const NOTE_MAX = 280;
export const OTHER_TEXT_MAX = 40;

// ── photo files ───────────────────────────────────────────────────────────

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
const MIME_BY_EXT: Record<string, PhotoMime> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

/** Content type of an accepted photo (HEIC often arrives with an empty `type`, so the extension decides), or null. */
export function photoMime(file: { name: string; type: string }): PhotoMime | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (type in { "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/heic": 1, "image/heif": 1 }) return type as PhotoMime;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return ext ? (MIME_BY_EXT[ext] ?? null) : null;
}

export type PhotoCheck = { ok: true; mime: PhotoMime } | { ok: false; reason: "bad_type" | "too_big" };

export function checkPhotoFile(file: { name: string; type: string; size: number }): PhotoCheck {
  const mime = photoMime(file);
  if (!mime) return { ok: false, reason: "bad_type" };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, reason: "too_big" };
  return { ok: true, mime };
}

// ── location resolution ───────────────────────────────────────────────────

/** EXIF `DateTimeOriginal` is naive local time (`2023-08-02T10:31:01`); the phone's clock is the same zone. */
export function isFreshPhoto(takenAt: string | null, now: number = Date.now()): boolean {
  if (!takenAt) return true;
  const t = new Date(takenAt).getTime();
  return Number.isFinite(t) ? Math.abs(now - t) <= FRESH_PHOTO_MS : true;
}

export interface PhotoFacts {
  /** Photo carries a valid GPS fix. */
  hasGps: boolean;
  /** Picked with "Sacar foto" (camera input), not from the gallery. */
  viaCamera: boolean;
  takenAt: string | null;
}

export type LocationPlan =
  /** Use the photo's own GPS. */
  | "exif"
  /** A fresh camera photo without GPS: ask the device. */
  | "device"
  /** A gallery photo without GPS: never guess, the user places the pin. */
  | "manual";

/** Resolution order of BUILD.md §7.3: photo GPS, then device (fresh camera photo only), then by hand. */
export function planLocation(photo: PhotoFacts, now: number = Date.now()): LocationPlan {
  if (photo.hasGps) return "exif";
  if (photo.viaCamera && isFreshPhoto(photo.takenAt, now)) return "device";
  return "manual";
}

export interface LatLng { lat: number; lng: number }

export function distanceKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
}

export function isLocationConflict(exif: LatLng, device: LatLng): boolean {
  return distanceKm(exif, device) > CONFLICT_KM;
}

/** What the card needs to know about the confirmed location. */
export interface LocationChoice extends LatLng {
  source: Extract<LocationSource, "exif" | "device" | "pin" | "search" | "paste">;
  /** Metres; only exif (GPSHPositioningError) and device fixes have one. */
  accuracyM: number | null;
}

// ── validation ────────────────────────────────────────────────────────────

export type IssueCode = "photo_busy" | "no_location" | "no_type";
export interface Issue { card: 1 | 2 | 3; code: IssueCode }

export interface ValidationInput {
  photoBusy: boolean;
  location: LocationChoice | null;
  /** Location card still waiting for the device. */
  locationBusy: boolean;
  types: readonly string[];
}

/** Everything that blocks "Mandale Mecha", in card order. */
export function validateAdd(input: ValidationInput): Issue[] {
  const issues: Issue[] = [];
  if (input.photoBusy) issues.push({ card: 1, code: "photo_busy" });
  if (!input.location || input.locationBusy) issues.push({ card: 2, code: "no_location" });
  if (input.types.length === 0) issues.push({ card: 3, code: "no_type" });
  return issues;
}

export const firstInvalidCard = (issues: readonly Issue[]): 1 | 2 | 3 | null => issues[0]?.card ?? null;

// ── request body ──────────────────────────────────────────────────────────

export interface MetaInput {
  location: LocationChoice;
  approximate: boolean;
  types: readonly string[];
  /** Free text of the type that allows it; ignored when blank. */
  otherText: string;
  soy: string;
  note: string;
  takenAt: string | null;
  photoSha256: string | null;
  turnstileToken: string | null;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/** Unique names (case-insensitive), trimmed, in the order typed. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = clean(raw);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** The `meta` part of `POST /api/spots`; matches `createSpotMeta` (the server validates the same schema). */
export function buildMeta(input: MetaInput): CreateSpotMeta {
  const { location } = input;
  const round = input.approximate ? round3 : (n: number) => n;
  const reporter = clean(input.soy) || null;
  const otherText = clean(input.otherText).slice(0, OTHER_TEXT_MAX);
  const note = input.note.trim().slice(0, NOTE_MAX);
  return {
    lat: round(location.lat),
    lng: round(location.lng),
    location_source: location.source,
    location_accuracy_m: location.accuracyM !== null && Number.isFinite(location.accuracyM) ? Math.round(location.accuracyM * 10) / 10 : null,
    is_approximate: input.approximate,
    types: [...new Set(input.types)],
    other_text: otherText || null,
    reporter,
    note: note || null,
    taken_at: input.takenAt,
    photo_sha256: input.photoSha256,
    turnstile_token: input.turnstileToken,
  };
}

// ── server errors ─────────────────────────────────────────────────────────

export type SubmitErrorKind = "network" | "rate_limited" | "turnstile" | "too_large" | "bad_image" | "exists" | "invalid" | "server";

/** Map an `ApiError` status/code to a kind the UI has a message for. */
export function classifySubmitError(status: number, code: string): SubmitErrorKind {
  if (status === 0) return "network";
  if (status === 409 && code === "photo_exists") return "exists";
  if (status === 429) return "rate_limited";
  if (status === 403 && code === "turnstile_failed") return "turnstile";
  if (status === 413 || code === "too_large") return "too_large";
  if (status === 415 || code === "bad_image") return "bad_image";
  if (status === 400) return "invalid";
  return "server";
}

/** Whether the draft should wait in IndexedDB for "Reintentar" (everything except a hard rejection of the photo). */
export const keepsDraft = (kind: SubmitErrorKind): boolean => kind !== "exists";

// ── patching your own spot (24 h) ─────────────────────────────────────────

export interface EditSnapshot {
  lat: number;
  lng: number;
  approximate: boolean;
  types: readonly string[];
  otherText: string;
  note: string;
}

/** Only the fields that changed (the endpoint is strict about unknown keys and rewrites what it receives). */
export function buildPatch(before: EditSnapshot, after: EditSnapshot, textSlugSelected: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
  if (after.lat !== before.lat || after.lng !== before.lng) {
    patch.lat = after.lat;
    patch.lng = after.lng;
  }
  if (after.approximate !== before.approximate) patch.is_approximate = after.approximate;
  // Sending the pin while approximate makes the server round it; flag it explicitly so the intent is clear.
  if (patch.lat !== undefined && after.approximate && patch.is_approximate === undefined) patch.is_approximate = true;
  const typesChanged = !sameSet(before.types, after.types);
  const otherTextChanged = clean(before.otherText) !== clean(after.otherText);
  if (typesChanged) patch.types = [...new Set(after.types)];
  if (typesChanged || otherTextChanged) patch.other_text = textSlugSelected ? clean(after.otherText).slice(0, OTHER_TEXT_MAX) || null : null;
  if (after.note.trim() !== before.note.trim()) patch.note = after.note.trim().slice(0, NOTE_MAX) || null;
  return patch;
}
