/** API data shapes shared by the Worker and the front end (BUILD.md §5, §8). */

export type LocationSource = "exif" | "device" | "pin" | "search" | "paste" | "legacy";
export type PlacerStatus = "self" | "other" | "unknown";
export type SpotStatus = "published" | "pending" | "hidden";
export type IconFit = "cover" | "contain";
export type ModerationMode = "open" | "approval";
export type Lang = "es" | "en";
export type FeatureFlag = "off" | "admin" | "on";

/** `GET /api/types`: an active sticker type; `icon` is a URL served by `/img/icons/*`. */
export interface StickerType {
  slug: string;
  label: string;
  icon: string;
  color: string;
  fit: IconFit;
  sort_order: number;
  allows_text: boolean;
  /** Published spots carrying this type (informational). */
  count?: number;
}

/** `GET /api/people`: canonical person names with how many stickers they stuck / reported. */
export interface PersonSummary {
  name: string;
  placed: number;
  reported: number;
}

/** Properties of one feature in `GET /api/spots`. Coordinates are in the GeoJSON geometry. */
export interface SpotProps {
  id: string;
  types: string[];
  placers: string[];
  placer_status: PlacerStatus;
  reporter: string | null;
  place_name: string | null;
  country: string | null;
  country_code: string | null;
  taken_at: string | null;
  created_at: string;
  /** `/img/thumb/<id>.webp` and `/img/display/<id>.webp`, or null for spots without a photo. */
  thumb: string | null;
  photo: string | null;
  /** Number of sticker types (marker "+N" badge). */
  n: number;
}

export interface SpotFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: SpotProps;
}

export interface SpotCollection {
  type: "FeatureCollection";
  features: SpotFeature[];
}

/** `GET /api/spots/:id`: one spot with the detail the sheet needs. */
export interface SpotDetail extends SpotProps {
  lat: number;
  lng: number;
  location_source: LocationSource;
  location_accuracy_m: number | null;
  is_approximate: boolean;
  city: string | null;
  note: string | null;
  other_text: string | null;
  placer_note: string | null;
  photo_w: number | null;
  photo_h: number | null;
  /** Reporter name or null for anonymous. */
  reporter: string | null;
}

export interface AppConfig {
  default_lang: Lang;
  moderation_mode: ModerationMode;
  turnstile_sitekey: string;
  features: { video: boolean; instagram: boolean; sightings: boolean; globe_wrapped: boolean };
}
