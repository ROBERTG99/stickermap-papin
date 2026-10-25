import type { SpotFeature } from "../shared/types";
import { haversineMeters } from "../shared/geo";

/**
 * Pure map logic: filters (client side, the dataset is tiny), the per-chip counts, bounds and "nearby" ordering.
 * No DOM, no MapLibre: everything here is unit tested (tests/unit/map-filters.test.ts).
 */

export type DatePreset = "all" | "month" | "halfYear" | "year";
export const DATE_PRESETS: readonly DatePreset[] = ["all", "month", "halfYear", "year"];

export interface Filters {
  /** Sticker type slugs (a spot matches when it carries ANY of them). */
  types: string[];
  /** Person names (whoever uploaded and stuck the sticker); `UNKNOWN_PLACER` matches the spots without one ("¿?"). */
  placers: string[];
  /** Lowercase ISO country codes. */
  countries: string[];
  date: DatePreset;
  /** F4: show the stickers that were covered or torn off ("despegados"); hidden by default. Not counted as an active filter. */
  showGone: boolean;
}

export const UNKNOWN_PLACER = "__unknown__";

export const EMPTY_FILTERS: Filters = { types: [], placers: [], countries: [], date: "all", showGone: false };

export type Facet = "types" | "placers" | "countries" | "date" | "life";

const DAY_MS = 86_400_000;
const PRESET_DAYS: Record<Exclude<DatePreset, "all">, number> = { month: 30, halfYear: 183, year: 365 };

/** The date a spot is filtered and shown by: when the photo was taken, else when it was uploaded. */
export function spotTime(f: SpotFeature): number {
  const p = f.properties;
  const t = Date.parse(p.taken_at ?? p.created_at);
  return Number.isNaN(t) ? Date.parse(p.created_at) : t;
}

export function dateCutoff(preset: DatePreset, now: number): number | null {
  return preset === "all" ? null : now - PRESET_DAYS[preset] * DAY_MS;
}

export const placerKeys = (f: SpotFeature): string[] =>
  f.properties.placers.length === 0 ? [UNKNOWN_PLACER] : f.properties.placers;

export const countryKey = (f: SpotFeature): string | null => f.properties.country_code?.toLowerCase() || null;

export function activeFilterCount(filters: Filters): number {
  return (
    (filters.types.length > 0 ? 1 : 0) +
    (filters.placers.length > 0 ? 1 : 0) +
    (filters.countries.length > 0 ? 1 : 0) +
    (filters.date !== "all" ? 1 : 0)
  );
}

export const isFiltering = (filters: Filters): boolean => activeFilterCount(filters) > 0;

/** Add the value when absent, remove it when present. */
export function toggleValue(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface Pass {
  types: boolean;
  placers: boolean;
  countries: boolean;
  date: boolean;
  life: boolean;
}

function passes(f: SpotFeature, filters: Filters, cutoff: number | null): Pass {
  const p = f.properties;
  const country = countryKey(f);
  return {
    types: filters.types.length === 0 || p.types.some((s) => filters.types.includes(s)),
    placers: filters.placers.length === 0 || placerKeys(f).some((k) => filters.placers.includes(k)),
    countries: filters.countries.length === 0 || (country !== null && filters.countries.includes(country)),
    date: cutoff === null || spotTime(f) >= cutoff,
    life: filters.showGone || p.life !== "dead",
  };
}

const FACETS: readonly Facet[] = ["types", "placers", "countries", "date", "life"];
const allExcept = (pass: Pass, skip: Facet): boolean => FACETS.every((d) => d === skip || pass[d]);

export function applyFilters(features: readonly SpotFeature[], filters: Filters, now = Date.now()): SpotFeature[] {
  const cutoff = dateCutoff(filters.date, now);
  return features.filter((f) => {
    const pass = passes(f, filters, cutoff);
    return pass.types && pass.placers && pass.countries && pass.date && pass.life;
  });
}

export interface FacetCounts {
  /** Spots matching every active filter. */
  total: number;
  types: Map<string, number>;
  placers: Map<string, number>;
  countries: Map<string, number>;
  date: Record<DatePreset, number>;
}

/**
 * Chip counts. Each facet is counted against the OTHER active filters (so a chip says how many spots you would get by
 * choosing it), never against its own selection; that keeps sibling chips of the same facet comparable.
 */
export function facetCounts(features: readonly SpotFeature[], filters: Filters, now = Date.now()): FacetCounts {
  const out: FacetCounts = {
    total: 0,
    types: new Map(),
    placers: new Map(),
    countries: new Map(),
    date: { all: 0, month: 0, halfYear: 0, year: 0 },
  };
  const cutoff = dateCutoff(filters.date, now);
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const f of features) {
    const pass = passes(f, filters, cutoff);
    if (FACETS.every((d) => pass[d])) out.total++;
    if (allExcept(pass, "types")) for (const s of new Set(f.properties.types)) bump(out.types, s);
    if (allExcept(pass, "placers")) for (const k of new Set(placerKeys(f))) bump(out.placers, k);
    if (allExcept(pass, "countries")) {
      const c = countryKey(f);
      if (c) bump(out.countries, c);
    }
    if (allExcept(pass, "date")) {
      const t = spotTime(f);
      out.date.all++;
      for (const preset of ["month", "halfYear", "year"] as const) if (t >= now - PRESET_DAYS[preset] * DAY_MS) out.date[preset]++;
    }
  }
  return out;
}

export interface CountryOption {
  code: string;
  name: string;
}

/** Countries present in the data (code + name), most common first. */
export function listCountries(features: readonly SpotFeature[]): CountryOption[] {
  const seen = new Map<string, { name: string; n: number }>();
  for (const f of features) {
    const code = countryKey(f);
    if (!code) continue;
    const prev = seen.get(code);
    if (prev) prev.n++;
    else seen.set(code, { name: f.properties.country ?? code.toUpperCase(), n: 1 });
  }
  return [...seen.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name)).map(([code, v]) => ({ code, name: v.name }));
}

/** Distinct values of a facet over ALL spots, most common first (stable by name). */
export function rankNames(features: readonly SpotFeature[], pick: (f: SpotFeature) => string[]): string[] {
  const n = new Map<string, number>();
  for (const f of features) for (const k of new Set(pick(f))) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

// ── geography ─────────────────────────────────────────────────────────────

export type LngLatBoundsLike = [[number, number], [number, number]];

/** South-west / north-east corners around every spot; null when there are none. */
export function computeBounds(features: readonly SpotFeature[]): LngLatBoundsLike | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return w === Infinity ? null : [[w, s], [e, n]];
}

/** The `limit` spots closest to `origin`, nearest first (ties broken by id so the order is stable). `origin` itself is skipped by id. */
export function nearestSpots(origin: { id?: string; lng: number; lat: number }, features: readonly SpotFeature[], limit: number): SpotFeature[] {
  return features
    .filter((f) => f.id !== origin.id)
    .map((f) => ({ f, d: haversineMeters(origin.lat, origin.lng, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
    .sort((a, b) => a.d - b.d || (a.f.id < b.f.id ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.f);
}

/** Previous / next spot id in chronological id order (ULIDs sort by time), wrapping around; null when there is nothing to step to. */
export function stepSpot(features: readonly SpotFeature[], currentId: string, step: 1 | -1): string | null {
  const ids = features.map((f) => f.id).sort();
  if (ids.length < 2) return null;
  const i = ids.indexOf(currentId);
  if (i < 0) return ids[0] ?? null;
  return ids[(i + step + ids.length) % ids.length] ?? null;
}
