import { ApiError } from "../../lib/api";

/** What to do after a failed `POST /api/spots` (BUILD.md §7.3b "Subiendo"). */
export type UploadFailure =
  /** 409 photo_exists: the photo is already on the map. */
  | { kind: "exists"; id: string | null }
  /** 401: the batch token expired; make a new batch and send again. */
  | { kind: "renew" }
  /** Worth another try after a pause (offline, 5xx). */
  | { kind: "retry"; code: string }
  /** Retrying cannot help: the item shows [Reintentar fallidas] only if the user wants to try again. */
  | { kind: "fail"; code: string };

export function interpretUploadError(e: unknown): UploadFailure {
  if (!(e instanceof ApiError)) return { kind: "retry", code: "offline" };
  const body = (e.body ?? {}) as { id?: unknown };
  if (e.status === 0) return e.code === "aborted" ? { kind: "fail", code: "aborted" } : { kind: "retry", code: "offline" };
  if (e.status === 409 && e.code === "photo_exists") return { kind: "exists", id: typeof body.id === "string" ? body.id : null };
  if (e.status === 409 && e.code === "batch_full") return { kind: "fail", code: "batch_full" };
  if (e.status === 401) return { kind: "renew" };
  if (e.status === 413) return { kind: "fail", code: "too_large" };
  if (e.status === 429) return { kind: "fail", code: "rate_limited" };
  if (e.status >= 500) return { kind: "retry", code: "server" };
  if (e.status === 400 || e.status === 415) return { kind: "fail", code: "rejected" };
  return { kind: "retry", code: "error" };
}

/** Pause before retry number `attempt` (1-based): 1 s, 2 s, 4 s. */
export const backoffMs = (attempt: number): number => 1000 * 2 ** (attempt - 1);

/** Failed items retry this many times before showing "Reintentar fallidas". */
export const MAX_RETRIES = 3;
export const PARALLEL_UPLOADS = 3;
