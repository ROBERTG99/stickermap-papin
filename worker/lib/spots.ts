import type { SpotCollection, SpotFeature } from "../../src/shared/types";

interface SpotRow {
  id: string; lat: number; lng: number; placer_status: "self" | "other" | "unknown";
  place_name: string | null; country: string | null; country_code: string | null;
  taken_at: string | null; created_at: string; updated_at: string;
  photo_key: string | null; thumb_key: string | null; reporter: string | null;
}

const img = (key: string | null) => (key ? `/img/${key}` : null);
/** '' means "looked up, nothing found" (see scripts/backfill-geocode.ts). */
const orNull = (v: string | null) => (v ? v : null);

/** Everything the map needs for all published spots, in 3 statements (one D1 round trip). */
export async function publishedCollection(db: D1Database): Promise<{ collection: SpotCollection; etag: string }> {
  const [spots, types, placers] = await db.batch([
    db.prepare(
      `SELECT s.id, s.lat, s.lng, s.placer_status, s.place_name, s.country, s.country_code, s.taken_at, s.created_at, s.updated_at,
              s.photo_key, s.thumb_key, p.display_name AS reporter
         FROM spots s LEFT JOIN people p ON p.id = s.reporter_person_id
        WHERE s.status = 'published' ORDER BY s.created_at, s.id`,
    ),
    db.prepare(
      `SELECT st.spot_id AS id, st.type_slug AS slug FROM spot_types st
         JOIN spots s ON s.id = st.spot_id AND s.status = 'published'
         JOIN sticker_types t ON t.slug = st.type_slug ORDER BY t.sort_order`,
    ),
    db.prepare(
      `SELECT sp.spot_id AS id, p.display_name AS name FROM spot_placers sp
         JOIN spots s ON s.id = sp.spot_id AND s.status = 'published'
         JOIN people p ON p.id = sp.person_id ORDER BY p.display_name`,
    ),
  ]);
  const group = <T extends { id: string }>(rows: T[], pick: (r: T) => string) => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.id, [...(m.get(r.id) ?? []), pick(r)]);
    return m;
  };
  const typeMap = group((types?.results ?? []) as { id: string; slug: string }[], (r) => r.slug);
  const placerMap = group((placers?.results ?? []) as { id: string; name: string }[], (r) => r.name);

  const rows = (spots?.results ?? []) as unknown as SpotRow[];
  let maxUpdated = "";
  const features: SpotFeature[] = rows.map((r) => {
    if (r.updated_at > maxUpdated) maxUpdated = r.updated_at;
    const t = typeMap.get(r.id) ?? [];
    return {
      type: "Feature",
      id: r.id,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id, types: t, placers: placerMap.get(r.id) ?? [], placer_status: r.placer_status, reporter: r.reporter,
        place_name: orNull(r.place_name), country: r.country, country_code: r.country_code, taken_at: r.taken_at,
        created_at: r.created_at, thumb: img(r.thumb_key), photo: img(r.photo_key), n: t.length,
      },
    };
  });
  return { collection: { type: "FeatureCollection", features }, etag: `W/"${maxUpdated}-${rows.length}"` };
}
