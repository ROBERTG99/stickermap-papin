import type { WhoPlacedValue } from "../../components/WhoPlaced";

/** Where a hand-placed pin came from (`LocationSource` values the Worker accepts for non-EXIF locations). */
export type PlacedSource = "pin" | "search" | "paste";

export interface PlacedLocation { lat: number; lng: number; source: PlacedSource }

/** Why a file could not be read at all; shown as `bulk.reason.<code>`. */
export type ReadErrorCode = "too-big" | "not-image" | "cant-open" | "cant-read" | "no-space";

/** Per-photo overrides of the batch defaults. `undefined` fields follow the defaults. */
export interface PhotoOverride {
  types?: string[];
  otherText?: string;
  placer?: WhoPlacedValue;
  note?: string;
}

export type UploadState = "idle" | "queued" | "done" | "failed" | "exists";

export interface PhotoUpload {
  state: UploadState;
  /** Spot id once created (or the spot that already had this photo). */
  spotId?: string;
  /** Error code of the last failure (`bulk.upload.error.<code>`). */
  error?: string;
  /** Number of the send (`DraftMeta.sendNo`) that carried this photo. */
  send?: number;
}

/** Everything about one photo except its blobs (those live in their own IndexedDB stores). */
export interface PhotoMeta {
  /** Client id; doubles as the batch `client_ref`. */
  id: string;
  /** Position in the order the files were read. */
  seq: number;
  name: string;
  size: number;
  sha256: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  /** Naive local `YYYY-MM-DDTHH:MM:SS`. */
  takenAt: string | null;
  error: ReadErrorCode | null;
  /** The original bytes are in IndexedDB (can be uploaded). */
  hasOriginal: boolean;
  /** Spot id of a published photo with the same SHA-256. */
  existsId: string | null;
  placed: PlacedLocation | null;
  omitted: boolean;
  override: PhotoOverride;
  upload: PhotoUpload;
}

export interface BulkDefaults {
  types: string[];
  otherText: string;
  placer: WhoPlacedValue;
  soy: string;
  approximate: boolean;
  originals: boolean;
}

export type BulkPhase = "choose" | "reading" | "review" | "uploading" | "done";

export interface ServerBatch {
  batchId: string;
  batchToken: string;
  /** ms since epoch. */
  tokenExpiresAt: number;
  editToken: string;
}

export interface DraftMeta {
  /** Client batch id: the IndexedDB key. */
  id: string;
  createdAt: number;
  updatedAt: number;
  phase: Exclude<BulkPhase, "choose">;
  /** How many files were picked (reading progress survives a reload). */
  total: number;
  existsChecked: boolean;
  defaults: BulkDefaults;
  /** Keys of "¿Mismo sticker?" groups the user dismissed. */
  dismissedSame: string[];
  /** Counts the "Mandale Mecha" presses of this draft: the progress bar only looks at the current send. */
  sendNo: number;
  /** The server batch of the current send. */
  server: ServerBatch | null;
  /** Result of the last send, for the "Listo" screen. */
  lastSend: { batchId: string; count: number } | null;
}
