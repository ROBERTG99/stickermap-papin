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
  /** Instagram handle without "@" (F2), when the person has one. */
  instagram?: string;
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
  /** Instagram handle by person name (F2); only people who have one. */
  ig?: Record<string, string>;
  /** Link to the spot's Instagram post or reel (F2). */
  ig_post?: string;
  /** F4: only when the spot is not alive: "unknown" (no news for 12 months) or "dead" (covered or removed). */
  life?: "unknown" | "dead";
  /** F1: extension of the spot's video (`/media/video/<id>.<v>`); marker play badge and gallery autoplay. */
  v?: "mp4" | "mov";
}

/** F1: the video of a spot, as `GET /api/spots/:id` returns it. */
export interface SpotVideo {
  /** `/media/video/<id>.mp4` (HTTP Range supported). */
  src: string;
  /** Poster frame, `/img/display/...`. */
  poster: string | null;
  duration_ms: number | null;
  w: number | null;
  h: number | null;
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
  video?: SpotVideo;
  /** F4: the life of the sticker, from the sightings people reported. */
  life_info?: SpotLife;
}

/** F4: life of a spot. `placed_at` is when it was stuck (photo date, else upload date). */
export interface SpotLife {
  status: "alive" | "unknown" | "dead";
  placed_at: string;
  last_seen_at: string | null;
  died_at: string | null;
  /** Sightings that are not rejected. */
  count: number;
  /** Whole days it lasted (dead), or its age so far. */
  days: number;
}

export type SightingStatus = "alive" | "damaged" | "covered" | "removed" | "moved";

/** `GET /api/spots/:id/sightings` */
export interface SightingView {
  id: string;
  status: SightingStatus;
  created_at: string;
  /** Verified (device within 300 m, or a fresh photo) or approved by an admin. */
  verified: boolean;
  /** Waiting for an admin or a second sighting: shown as "pendiente". */
  pending: boolean;
  reporter: string | null;
  note: string | null;
  photo: string | null;
  thumb: string | null;
  video: SpotVideo | null;
}

export interface AppConfig {
  default_lang: Lang;
  moderation_mode: ModerationMode;
  turnstile_sitekey: string;
  map_style_url: string;
  features: { video: boolean; instagram: boolean; sightings: boolean; globe_wrapped: boolean };
}
