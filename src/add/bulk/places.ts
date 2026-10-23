import { geocodeKey } from "../../shared/geo";

/**
 * Place lookups through Photon (https://photon.komoot.io): search for the "Ubicar" sheet and a gentle reverse lookup for the
 * suggestion line and the row titles. Photon answers 400 to `lang=es` (only default, de, en, fr), so no `lang` is sent.
 */
const PHOTON = "https://photon.komoot.io";

export interface PlaceHit { id: string; label: string; lat: number; lng: number }

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
}

function label(p: NonNullable<PhotonFeature["properties"]>): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const head = (p.name as string | undefined) ?? (street || (p.locality as string | undefined) || (p.district as string | undefined));
  const area = (p.city as string | undefined) ?? (p.county as string | undefined) ?? (p.state as string | undefined);
  const parts = [head, head !== street && street && p.name ? street : undefined, area, p.country as string | undefined].filter(
    (x, i, all): x is string => !!x && all.indexOf(x) === i,
  );
  return parts.slice(0, 3).join(", ");
}

/** Up to 5 places; `near` biases the ranking toward where the rest of the batch is. */
export async function searchPlaces(query: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<PlaceHit[]> {
  const url = new URL(`${PHOTON}/api/`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  if (near) {
    url.searchParams.set("lat", near.lat.toFixed(4));
    url.searchParams.set("lon", near.lng.toFixed(4));
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const hits: PlaceHit[] = [];
  for (const [i, f] of (body.features ?? []).entries()) {
    const c = f.geometry?.coordinates;
    if (!c || !f.properties) continue;
    const text = label(f.properties);
    if (!text) continue;
    hits.push({ id: `${i}:${text}`, label: text, lng: c[0], lat: c[1] });
  }
  return hits;
}

const names = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
let lastCall = 0;
let budget = 40;

/** Cached by 3-decimal key (~100 m); at most ~40 lookups per page visit and one at a time, 1 per second. */
export function reverseName(lat: number, lng: number): Promise<string | null> {
  const key = geocodeKey(lat, lng);
  if (names.has(key)) return Promise.resolve(names.get(key) ?? null);
  const pending = inflight.get(key);
  if (pending) return pending;
  if (budget <= 0) return Promise.resolve(null);
  budget--;
  const run = (async () => {
    const wait = lastCall + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const res = await fetch(`${PHOTON}/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { features?: PhotonFeature[] };
      const props = body.features?.[0]?.properties;
      const text = props ? label(props) : "";
      names.set(key, text || null);
      return text || null;
    } catch {
      names.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

export const cachedName = (lat: number, lng: number): string | null => names.get(geocodeKey(lat, lng)) ?? null;
