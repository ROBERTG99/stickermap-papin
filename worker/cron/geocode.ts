import { geocodeKey } from "../../src/shared/geo";
import type { Env } from "../env";
import { reverseGeocode, type Place } from "../lib/geocode";

/** Nominatim policy for scheduled jobs: at most 4 requests per minute, >= 1 s apart (BUILD.md §4.1, §7.3b). */
export const MAX_REQUESTS_PER_RUN = 4;
const SPACING_MS = 1100;
const BACKOFF_MS = 3_600_000;
const BATCH_SIZE = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fill place names for spots that have none: cache hits first (free), then up to 4 Nominatim lookups. */
export async function runGeocodeCron(env: Env, now = Date.now()): Promise<{ filled: number; requests: number }> {
  const db = env.DB;
  const backoff = await db.prepare("SELECT value FROM settings WHERE key = 'geocode_backoff_until'").first<{ value: string }>();
  if (backoff && Number(backoff.value) > now) return { filled: 0, requests: 0 };

  const { results: pending } = await db
    .prepare("SELECT id, lat, lng FROM spots WHERE place_name IS NULL AND status != 'hidden' ORDER BY created_at LIMIT ?1")
    .bind(BATCH_SIZE)
    .all<{ id: string; lat: number; lng: number }>();
  if (pending.length === 0) return { filled: 0, requests: 0 };

  const cached = new Map<string, Place | null>();
  const keys = [...new Set(pending.map((s) => geocodeKey(s.lat, s.lng)))];
  const { results: hits } = await db
    .prepare(`SELECT key, place_name, city, country, country_code FROM geocode_cache WHERE key IN (${keys.map(() => "?").join(",")})`)
    .bind(...keys)
    .all<{ key: string; place_name: string | null; city: string | null; country: string | null; country_code: string | null }>();
  for (const h of hits) cached.set(h.key, h.place_name ? { place_name: h.place_name, city: h.city, country: h.country, country_code: h.country_code } : null);

  let requests = 0;
  const statements: D1PreparedStatement[] = [];
  const iso = new Date(now).toISOString();
  for (const key of keys) {
    if (!cached.has(key)) {
      if (requests >= MAX_REQUESTS_PER_RUN) continue;
      if (requests > 0) await sleep(SPACING_MS);
      const [lat, lng] = key.split(",").map(Number) as [number, number];
      requests++;
      const outcome = await reverseGeocode(lat, lng, env.CONTACT_EMAIL);
      if (outcome.kind === "blocked") {
        statements.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('geocode_backoff_until', ?1)").bind(String(now + BACKOFF_MS)));
        break;
      }
      const place = outcome.kind === "ok" ? outcome.place : null;
      cached.set(key, place);
      statements.push(
        db.prepare("INSERT OR REPLACE INTO geocode_cache (key, place_name, city, country, country_code, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
          .bind(key, place?.place_name ?? null, place?.city ?? null, place?.country ?? null, place?.country_code ?? null, iso),
      );
    }
  }
  let filled = 0;
  for (const s of pending) {
    const key = geocodeKey(s.lat, s.lng);
    if (!cached.has(key)) continue;
    const p = cached.get(key) ?? null;
    filled++;
    // '' = looked up, nothing found: the spot is not picked again
    statements.push(
      db.prepare("UPDATE spots SET place_name = ?2, city = ?3, country = ?4, country_code = ?5, updated_at = ?6 WHERE id = ?1 AND place_name IS NULL")
        .bind(s.id, p?.place_name ?? "", p?.city ?? null, p?.country ?? null, p?.country_code ?? null, iso),
    );
  }
  if (statements.length) await db.batch(statements);
  console.log(JSON.stringify({ job: "geocode", nominatim_requests: requests, filled }));
  return { filled, requests };
}
