import type { ProcessedPhoto } from "../lib/photo";
import type { SpotDetail } from "../shared/types";
import type { DeviceFix } from "./device";
import type { Place } from "./geocode";
import type { LocationChoice, SubmitErrorKind } from "./logic";

/** A location read from somewhere that is not (yet) the confirmed pin. */
export interface Candidate extends LatLngLike {
  accuracyM: number | null;
}
interface LatLngLike { lat: number; lng: number }

export interface PhotoState {
  file: File;
  viaCamera: boolean;
  status: "processing" | "ready";
  processed: ProcessedPhoto | null;
  /** Object URL for the thumbnail (the file itself while processing, the display derivative after). */
  previewUrl: string | null;
  /** The user answered "No, es otro lugar" to the duplicate question: send it without the hash and original. */
  keepAnyway: boolean;
  rotating: boolean;
}

export type PhotoError = "bad_type" | "too_big" | "unreadable";

/** Camera request for the map: a new `nonce` means "go there". */
export interface MapFocus extends LatLngLike {
  zoom: number;
  nonce: number;
}

export interface ConflictInfo {
  exifName: string;
  deviceName: string;
  km: number;
}

export type DuplicateStage = "closed" | "ask" | "add";

export interface AddState {
  photo: PhotoState | null;
  photoError: PhotoError | null;

  /** The confirmed pin; null until the photo, the device, a search, a link or a tap puts one. */
  choice: LocationChoice | null;
  /** The choice before the pin was dragged, for "Volver a …". */
  revert: LocationChoice | null;
  exif: Candidate | null;
  device: DeviceFix | null;
  resolving: boolean;
  denied: boolean;
  conflict: ConflictInfo | null;
  results: Place[];
  paste: { text: string; coords: string } | null;
  pasteError: string | null;
  focus: MapFocus | null;
  approximate: boolean;

  types: string[];
  otherText: string;
  soy: string;
  note: string;
  noteOpen: boolean;

  attempted: boolean;
  phase: "idle" | "uploading" | "failed";
  progress: number;
  error: SubmitErrorKind | null;

  duplicate: { id: string; spot: SpotDetail | null } | null;
  duplicateStage: DuplicateStage;
  addingHere: boolean;
  /** A draft was restored from IndexedDB. */
  restored: boolean;
}
