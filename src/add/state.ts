import type { Derivative, ProcessedPhoto } from "../lib/photo";
import type { VideoProbe, VideoResult } from "../lib/video";
import type { TrimWindow } from "../lib/video-meta";
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

/** F1: the clip being prepared. `trim` waits for "Usar este video"; `ready` has the converted file and its poster. */
export interface VideoState {
  file: File;
  viaCamera: boolean;
  status: "probing" | "trim" | "processing" | "ready";
  probe: VideoProbe | null;
  window: TrimWindow;
  muted: boolean;
  /** Object URL of the original, for the trim preview. */
  previewUrl: string;
  /** 0-100 while converting. */
  progress: number;
  result: VideoResult | null;
  /** Poster frame as display + thumb, ready to upload. */
  poster: { display: Derivative; thumb: Derivative } | null;
  /** Object URL of the converted clip (or of the original in the fallback). */
  resultUrl: string | null;
  /** Object URL of the poster, to show before the video loads. */
  posterUrl: string | null;
}

export type VideoError = "bad_type" | "too_big" | "unreadable" | "cannot_convert" | "cannot_poster";

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
  /** F1 */
  video: VideoState | null;
  videoError: VideoError | null;

  /** The confirmed pin; null until the photo, the device, a search, a link or a tap puts one. */
  choice: LocationChoice | null;
  /** The choice before the pin was dragged, for "Volver a …". */
  revert: LocationChoice | null;
  exif: Candidate | null;
  /** F1: the `exif` candidate was read from the clip, not from a photo. */
  exifFromVideo: boolean;
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
  /** F2: "Tu Instagram" (without @) and the post link, as typed. */
  instagram: string;
  postUrl: string;
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
