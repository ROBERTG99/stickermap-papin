import type { AppConfig, PersonSummary, SightingView, SpotCollection, SpotDetail, StickerType } from "../shared/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body?: unknown) {
    super(`${status} ${code}`);
  }
  get offline() { return this.status === 0; }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "offline");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? "error", body);
  return body as T;
}

const send = <T>(method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  json<T>(path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

/** Multipart POST with upload progress (fetch has none). Resolves with the parsed JSON or rejects with ApiError. */
export function postForm<T>(path: string, form: FormData, opts: { headers?: Record<string, string>; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, "offline"));
    xhr.ontimeout = () => reject(new ApiError(0, "offline"));
    xhr.onabort = () => reject(new ApiError(0, "aborted"));
    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, (body as { error?: string } | null)?.error ?? "error", body));
    };
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export interface CreatedSpot { id: string; editToken?: string; existing?: boolean }
export interface CreatedBatch { batchId: string; batchToken: string; editToken: string }
export interface StatsPayload {
  total_spots: number; total_countries: number; unknown_placers: number;
  types: { slug: string; label: string; count: number }[];
  placers: { name: string; count: number; countries: number }[];
  countries: { code: string; name: string; count: number }[];
  months: { month: string; count: number }[];
}

/** F4 `GET /api/stats/longevity`. */
export interface LongevityPayload {
  totals: { alive: number; unknown: number; dead: number };
  oldest_living: { id: string; place_name: string | null; country_code: string | null; types: string[]; reporter: string | null; age_days: number }[];
  by_type: { key: string; label: string; avg_days: number; count: number }[];
  by_city: { key: string; label: string; avg_days: number; count: number }[];
  cemetery: { id: string; place_name: string | null; country_code: string | null; types: string[]; reporter: string | null; died_at: string | null; days: number }[];
  curves: { key: string; label: string; points: { day: number; alive: number }[] }[];
}

export interface CreatedSighting { id: string; verified: boolean; pending: boolean; life: string | null }

export const api = {
  config: () => json<AppConfig>("/api/config"),
  spots: () => json<SpotCollection>("/api/spots"),
  /** `fresh` skips the browser cache (after a write that changes the spot). */
  spot: (id: string, fresh = false) => json<SpotDetail>(`/api/spots/${id}`, fresh ? { cache: "reload" } : undefined),
  types: () => json<StickerType[]>("/api/types"),
  people: () => json<PersonSummary[]>("/api/people"),
  stats: () => json<StatsPayload>("/api/stats"),
  exists: (sha: string) => json<{ id: string }>(`/api/spots/exists?sha=${sha}`),
  existsMany: (sha256: string[]) => send<Record<string, string>>("POST", "/api/spots/exists", { sha256 }),
  createSpot: (form: FormData, opts?: { batchToken?: string; onProgress?: (f: number) => void; signal?: AbortSignal }) =>
    postForm<CreatedSpot>("/api/spots", form, { headers: opts?.batchToken ? { "X-Batch-Token": opts.batchToken } : undefined, onProgress: opts?.onProgress, signal: opts?.signal }),
  createBatch: (body: { reporter?: string | null; turnstile_token?: string | null }) => send<CreatedBatch>("POST", "/api/batches", body),
  deleteBatch: (id: string, editToken: string) => send<{ hidden: number }>("DELETE", `/api/batches/${id}`, undefined, { "X-Edit-Token": editToken }),
  addTypes: (id: string, body: unknown) => send<{ id: string }>("POST", `/api/spots/${id}/types`, body),
  report: (id: string, body: { turnstile_token?: string | null }) => send<{ id: string }>("POST", `/api/spots/${id}/report`, body),
  patchSpot: (id: string, editToken: string, body: unknown) => send<{ id: string }>("PATCH", `/api/spots/${id}`, body, { "X-Edit-Token": editToken }),
  sightings: (id: string, fresh = false) => json<SightingView[]>(`/api/spots/${id}/sightings`, fresh ? { cache: "reload" } : undefined),
  createSighting: (id: string, form: FormData, opts?: { onProgress?: (f: number) => void; signal?: AbortSignal }) => postForm<CreatedSighting>(`/api/spots/${id}/sightings`, form, opts),
  longevity: () => json<LongevityPayload>("/api/stats/longevity"),
  deleteSpot: (id: string, editToken: string) => send<{ id: string }>("DELETE", `/api/spots/${id}`, undefined, { "X-Edit-Token": editToken }),
};
