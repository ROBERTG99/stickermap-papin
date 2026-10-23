/** Place search through Photon (komoot), OpenStreetMap data, no key: https://photon.komoot.io */

export const PHOTON_URL = "https://photon.komoot.io/api/";
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;

export interface PlaceResult {
  id: string;
  name: string;
  /** "Comunidad de Madrid, España" */
  detail: string;
  lng: number;
  lat: number;
  /** [west, south, east, north] when the place has an extent (cities, countries); points have none. */
  bbox: [number, number, number, number] | null;
}

/**
 * Photon only knows the languages default / en / de / fr (`lang=es` answers 400), so Spanish uses the default (local)
 * names, which is what you want when looking for a place abroad anyway.
 */
export function photonUrl(query: string, lang: "es" | "en" = "es", limit = 5): string {
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  if (lang === "en") params.set("lang", "en");
  return `${PHOTON_URL}?${params.toString()}`;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function parsePhoton(json: unknown): PlaceResult[] {
  const features = (json as { features?: PhotonFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const props = f.properties ?? {};
    if (!Array.isArray(coords) || typeof coords[0] !== "number" || typeof coords[1] !== "number") continue;
    const name = str(props.name) || str(props.street) || str(props.city);
    if (!name) continue;
    const detail = [str(props.street) && str(props.name) ? str(props.street) : "", str(props.city), str(props.county), str(props.state), str(props.country)]
      .filter((part, i, all) => part && part !== name && all.indexOf(part) === i)
      .join(", ");
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ext = props.extent;
    const bbox =
      Array.isArray(ext) && ext.length === 4 && ext.every((n) => typeof n === "number")
        ? ([Math.min(ext[0] as number, ext[2] as number), Math.min(ext[1] as number, ext[3] as number), Math.max(ext[0] as number, ext[2] as number), Math.max(ext[1] as number, ext[3] as number)] as [number, number, number, number])
        : null;
    out.push({ id: `${str(props.osm_type)}${String(props.osm_id ?? out.length)}`, name, detail, lng: coords[0], lat: coords[1], bbox });
  }
  return out;
}

export async function searchPlaces(query: string, lang: "es" | "en", signal?: AbortSignal): Promise<PlaceResult[]> {
  const res = await fetch(photonUrl(query, lang), { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  return parsePhoton(await res.json());
}
