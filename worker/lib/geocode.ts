/**
 * Reverse geocoding through Nominatim (BUILD.md §4.1, §8). Used by the cron trigger and by
 * scripts/backfill-geocode.ts. Policy: <= 1 request/second, <= 4 requests/minute for scheduled jobs,
 * a descriptive User-Agent, answers cached by coordinates rounded to 3 decimals.
 */
export interface Place {
  place_name: string;
  city: string | null;
  country: string | null;
  country_code: string | null;
}

export type ReverseOutcome =
  | { kind: "ok"; place: Place }
  | { kind: "none" } // Nominatim answered but there is nothing there (ocean, etc.)
  | { kind: "blocked"; status: number }; // 429 / 403: back off

interface NominatimAddress {
  city?: string; town?: string; village?: string; municipality?: string; hamlet?: string; county?: string;
  state?: string; region?: string; country?: string; country_code?: string;
}

export function formatPlace(address: NominatimAddress): Place | null {
  const city = address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? address.county ?? null;
  const region = address.state ?? address.region ?? null;
  const country = address.country ?? null;
  const parts = [city, region && region !== city ? region : null].filter((p): p is string => !!p);
  const place_name = parts.length > 0 ? parts.join(", ") : country;
  if (!place_name) return null;
  return { place_name, city, country, country_code: address.country_code?.toLowerCase() ?? null };
}

export function userAgent(contactEmail: string): string {
  return `MapaPapin/1.0 (+${contactEmail})`;
}

export async function reverseGeocode(lat: number, lng: number, contactEmail: string, fetchImpl: typeof fetch = fetch): Promise<ReverseOutcome> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=es&lat=${lat}&lon=${lng}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": userAgent(contactEmail) } });
  if (res.status === 429 || res.status === 403) return { kind: "blocked", status: res.status };
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const body = (await res.json()) as { address?: NominatimAddress; error?: string };
  const place = body.address ? formatPlace(body.address) : null;
  return place ? { kind: "ok", place } : { kind: "none" };
}
