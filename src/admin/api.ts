/**
 * Admin API client (`/api/admin/*`, BUILD.md §7.4, §8). Everything the admin pages read or change goes through here;
 * the Worker audits every write. Errors surface as `ApiError` (see `src/lib/api.ts`).
 */
import { ApiError } from "../lib/api";
import type { FeatureFlag, IconFit, Lang, LocationSource, ModerationMode, PlacerStatus, SpotStatus } from "../shared/types";

export interface AdminSpot {
  id: string;
  lat: number;
  lng: number;
  status: SpotStatus;
  needs_review: boolean;
  review_reasons: string[];
  types: string[];
  placers: string[];
  placer_status: PlacerStatus;
  reporter: string | null;
  place_name: string | null;
  country: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
  taken_at: string | null;
  /** Admin-only image URLs (`/api/admin/img/...`), also for hidden and pending spots. */
  thumb: string | null;
  photo: string | null;
  has_original: boolean;
  batch_id: string | null;
  legacy_objectids: number[];
  legacy_filename: string | null;
  location_source: LocationSource;
  is_approximate: boolean;
  note: string | null;
  other_text: string | null;
}

export interface AdminType {
  slug: string;
  label: string;
  /** Public URL of the icon (`/img/icons/...`). */
  icon: string;
  color: string;
  fit: IconFit;
  sort_order: number;
  allows_text: boolean;
  is_active: boolean;
  /** Spots carrying this type, any status. */
  count: number;
}

export interface AdminPerson {
  id: number;
  name: string;
  placed: number;
  reported: number;
  aliases: string[];
  /** Instagram handle without "@" (F2). */
  instagram: string | null;
}

export type FeatureKey = "video" | "instagram" | "sightings" | "globe_wrapped";

export interface AdminSettings {
  settings: Partial<Record<string, string>>;
  storage: { used_bytes: number; limit_bytes: number; level: "ok" | "warning" | "critical" };
  backups: { d1: BackupInfo | null; gpkg: BackupInfo | null };
}

export interface BackupInfo { key: string; uploaded: string; size: number }

export interface SettingsPatch {
  moderation_mode?: ModerationMode;
  default_lang?: Lang;
  map_style_url?: string;
  feature_video?: FeatureFlag;
  feature_instagram?: FeatureFlag;
  feature_sightings?: FeatureFlag;
  feature_globe_wrapped?: FeatureFlag;
}

export interface AuditEntry { id: number; at: string; actor: string; action: string; entity: string; entity_id: string | null; diff_json: string | null }

export interface SpotPatch {
  lat?: number;
  lng?: number;
  types?: string[];
  reporter?: string | null;
  note?: string | null;
  other_text?: string | null;
  place_name?: string | null;
  status?: SpotStatus;
  needs_review?: boolean;
  review_reason?: string | null;
  is_approximate?: boolean;
  location_source?: LocationSource;
}

export type BulkAction = "approve" | "hide" | "delete" | "restore" | "clear_review" | "assign_person" | "set_types" | "fuzz";

/* ── Filters (shared by the review queue, the table and the exports) ───────────────────── */

export type StatusFilter = "" | "queue" | "published" | "pending" | "hidden" | "trash";
export type SortDir = "asc" | "desc";

export interface SpotFilters {
  status: StatusFilter;
  /** One review reason code (`duplicate_photo_far_apart`...). */
  reason: string;
  /** Spots without an uploader ("Sin persona"). */
  anonymous: boolean;
  type: string;
  country: string;
  /** "" | "any" | a batch id. */
  batch: string;
  q: string;
  sort: string;
  dir: SortDir;
}

export const EMPTY_FILTERS: SpotFilters = { status: "", reason: "", anonymous: false, type: "", country: "", batch: "", q: "", sort: "created_at", dir: "desc" };

/** Query string of `/api/admin/spots` and `/api/admin/export`: only the active filters, so both endpoints see the same thing. */
export function filterParams(f: Partial<SpotFilters>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.reason) p.set("reason", f.reason);
  if (f.anonymous) p.set("anonymous", "1");
  if (f.type) p.set("type", f.type);
  if (f.country) p.set("country", f.country);
  if (f.batch) p.set("batch", f.batch);
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.sort) p.set("sort", f.sort);
  if (f.dir) p.set("dir", f.dir);
  return p;
}

/** True when the filters narrow the list down (anything but sort order). */
export function hasActiveFilters(f: SpotFilters): boolean {
  return Boolean(f.status || f.reason || f.anonymous || f.type || f.country || f.batch || f.q.trim());
}

/* ── Requests ──────────────────────────────────────────────────────────────────────────── */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data);
  return data as T;
}

export interface SpotsPage { total: number; rows: AdminSpot[] }

export const adminApi = {
  me: () => request<{ email: string }>("GET", "/api/admin/me"),
  spots: (params: URLSearchParams) => request<SpotsPage>("GET", `/api/admin/spots?${params}`),
  spot: (id: string) => request<AdminSpot>("GET", `/api/admin/spots/${encodeURIComponent(id)}`),
  patchSpot: (id: string, body: SpotPatch) => request<{ id: string }>("PATCH", `/api/admin/spots/${encodeURIComponent(id)}`, body),
  bulk: (ids: string[], action: BulkAction, extra: { person?: string; types?: string[] } = {}) =>
    request<{ ok: true; count: number }>("POST", "/api/admin/spots/bulk", { ids, action, ...extra }),
  hideBatch: (id: string) => request<{ id: string; hidden: number }>("DELETE", `/api/batches/${encodeURIComponent(id)}`),

  types: () => request<AdminType[]>("GET", "/api/admin/types"),
  createType: (form: FormData) => request<{ slug: string }>("POST", "/api/admin/types", form),
  updateType: (slug: string, form: FormData) => request<{ slug: string }>("PATCH", `/api/admin/types/${encodeURIComponent(slug)}`, form),
  promoteType: (form: FormData) => request<{ slug: string; retagged: number }>("POST", "/api/admin/types/promote", form),

  people: () => request<AdminPerson[]>("GET", "/api/admin/people"),
  mergePeople: (from_id: number, into_id: number) => request<{ id: number }>("POST", "/api/admin/people/merge", { from_id, into_id }),
  updatePerson: (id: number, body: { display_name?: string; instagram?: string | null }) => request<{ id: number }>("PATCH", `/api/admin/people/${id}`, body),

  settings: () => request<AdminSettings>("GET", "/api/admin/settings"),
  saveSettings: (patch: SettingsPatch) => request<{ ok: true }>("PUT", "/api/admin/settings", patch),
  audit: (limit = 30) => request<AuditEntry[]>("GET", `/api/admin/audit?limit=${limit}`),
};

/** Every row matching the filters, fetched in pages of 1000 (the API maximum). `onProgress(loaded, total)` after each page. */
export async function fetchAllSpots(filters: Partial<SpotFilters>, onProgress?: (loaded: number, total: number) => void): Promise<AdminSpot[]> {
  const base = filterParams(filters);
  const all: AdminSpot[] = [];
  for (;;) {
    const params = new URLSearchParams(base);
    params.set("limit", "1000");
    params.set("offset", String(all.length));
    const page = await adminApi.spots(params);
    all.push(...page.rows);
    onProgress?.(all.length, page.total);
    if (page.rows.length === 0 || all.length >= page.total) return all;
  }
}

/** Patch that puts a spot back exactly as it was (moderation undo). */
export function restorePatch(prev: AdminSpot): SpotPatch {
  return {
    status: prev.status,
    needs_review: prev.needs_review,
    review_reason: prev.review_reasons.length ? prev.review_reasons.join(",") : null,
  };
}

/* ── Downloads ─────────────────────────────────────────────────────────────────────────── */

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Download a file endpoint (export, backup, original) through fetch so a failure becomes a toast instead of a blank tab. */
export async function downloadFrom(path: string, fallbackName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new ApiError(0, "offline");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? "error", data);
  }
  const named = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  const filename = named ?? fallbackName;
  saveBlob(await res.blob(), filename);
  return filename;
}
