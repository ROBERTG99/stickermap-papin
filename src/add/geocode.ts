/**
 * Place search and reverse lookup for the Ubicación card (BUILD.md §7.3): Photon first (debounced by the picker),
 * Nominatim as the fallback. Both are allowed by the CSP `connect-src`. Parsers are pure and unit-tested.
 */
import { formatCoords } from "../lib/format";

export interface Place {
  id: string;
  /** "Plaza Independencia, Montevideo, Uruguay". */
  label: string;
  lat: number;
  lng: number;
  /** Rough zoom for the map to show this place (a country is not a street). */
  zoom: number;
}

const PHOTON = "https://photon.komoot.io";
const NOMINATIM = "https://nominatim.openstreetmap.org";

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function dedupe(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) if (p && !out.some((q) => q.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
}

/** City-ish place types zoom out; a street address or a shop zooms in. */
function zoomFor(kind: string): number {
  if (/^(country|state|region)$/.test(kind)) return 5;
  if (/^(county|district|city|town|municipality|locality|borough|suburb|neighbourhood|village|hamlet)$/.test(kind)) return 12;
  return 17;
}

/** Photon answers a GeoJSON FeatureCollection. */
export function parsePhoton(json: unknown): Place[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: Place[] = [];
  for (const f of features as { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }[]) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!isNum(lat) || !isNum(lng)) continue;
    const p = f.properties ?? {};
    const street = [text(p.street), text(p.housenumber)].filter(Boolean).join(" ");
    const label = dedupe([text(p.name) || street, text(p.city) || text(p.district) || text(p.county) || text(p.state), text(p.country)]).join(", ");
    if (!label) continue;
    out.push({ id: `${text(p.osm_type)}${String(p.osm_id ?? "")}:${lat.toFixed(5)},${lng.toFixed(5)}`, label, lat, lng, zoom: zoomFor(text(p.type) || text(p.osm_value)) });
  }
  return out;
}

/** Nominatim `format=jsonv2` answers an array. */
export function parseNominatim(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const out: Place[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const parts = text(r.display_name).split(",").map((s) => s.trim()).filter(Boolean);
    const short = parts.length > 3 ? [parts[0] ?? "", parts[1] ?? "", parts[parts.length - 1] ?? ""] : parts;
    const label = dedupe(short).join(", ");
    if (!label) continue;
    out.push({ id: `n${String(r.place_id ?? "")}:${lat.toFixed(5)},${lng.toFixed(5)}`, label, lat, lng, zoom: zoomFor(text(r.addresstype) || text(r.type)) });
  }
  return out;
}

/** Photon rejects `lang=es` (it only knows default, de, en, fr). We try it once per page load, then stop. */
let photonLang = true;

async function getJson(url: string, signal?: AbortSignal): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = encodeURIComponent(query);
  try {
    let res = await getJson(`${PHOTON}/api/?q=${q}&limit=5${photonLang ? "&lang=es" : ""}`, signal);
    if (!res.ok && res.status === 400 && photonLang) {
      photonLang = false;
      res = await getJson(`${PHOTON}/api/?q=${q}&limit=5`, signal);
    }
    if (res.ok) return parsePhoton(res.json);
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const fallback = await getJson(`${NOMINATIM}/search?format=jsonv2&limit=5&q=${q}`, signal);
  if (!fallback.ok) throw new Error(`search ${fallback.status}`);
  return parseNominatim(fallback.json);
}

/** A short name for a point ("Shanghái", "Auburn"), or its coordinates when the lookup fails. Never throws. */
export async function placeNameAt(lat: number, lng: number, signal?: AbortSignal): Promise<string> {
  try {
    const res = await getJson(`${PHOTON}/reverse?lon=${lng}&lat=${lat}&limit=1`, signal);
    if (res.ok) {
      const p = (res.json as { features?: { properties?: Record<string, unknown> }[] } | null)?.features?.[0]?.properties;
      const name = text(p?.city) || text(p?.district) || text(p?.county) || text(p?.state) || text(p?.name) || text(p?.country);
      if (name) return name;
    }
  } catch {
    /* fall through to Nominatim */
  }
  try {
    const res = await getJson(`${NOMINATIM}/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`, signal);
    const a = (res.json as { address?: Record<string, unknown>; name?: unknown } | null)?.address;
    const name = text(a?.city) || text(a?.town) || text(a?.village) || text(a?.county) || text(a?.state) || text(a?.country);
    if (res.ok && name) return name;
  } catch {
    /* use the coordinates */
  }
  return formatCoords(lat, lng);
}
