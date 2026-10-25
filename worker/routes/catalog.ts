import { Hono } from "hono";
import type { AppConfig, FeatureFlag, Lang, ModerationMode, PersonSummary, StickerType } from "../../src/shared/types";
import type { AppEnv } from "../app";
import { adminFromRequest } from "../lib/access";
import { bearingDegrees, haversineMeters } from "../../src/shared/geo";
import { ageDays, placedAtOf, survivalDays } from "../../src/shared/life";
import { averageBy, survivalCurve } from "../../src/shared/survival";
import { cachedJson } from "../lib/cache";

export const catalog = new Hono<AppEnv>();

const FIVE_MIN = "public, max-age=300";

catalog.get("/types", (c) =>
  cachedJson(c, async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT t.slug, t.label, t.icon_key, t.color, t.fit, t.sort_order, t.allows_text,
              (SELECT COUNT(*) FROM spot_types st JOIN spots s ON s.id = st.spot_id AND s.status = 'published' WHERE st.type_slug = t.slug) AS count
         FROM sticker_types t WHERE t.is_active = 1 ORDER BY t.sort_order, t.slug`,
    ).all<{ slug: string; label: string; icon_key: string; color: string; fit: "cover" | "contain"; sort_order: number; allows_text: number; count: number }>();
    const body: StickerType[] = results.map((r) => ({
      slug: r.slug, label: r.label, icon: `/img/${r.icon_key}`, color: r.color, fit: r.fit, sort_order: r.sort_order, allows_text: r.allows_text === 1, count: r.count,
    }));
    return { body, etag: `W/"types-${body.map((t) => `${t.slug}${t.count}`).join("")}"` };
  }, FIVE_MIN),
);

catalog.get("/people", (c) =>
  cachedJson(c, async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT p.display_name AS name, p.instagram_handle AS instagram,
              (SELECT COUNT(*) FROM spot_placers sp JOIN spots s ON s.id = sp.spot_id AND s.status = 'published' WHERE sp.person_id = p.id) AS placed,
              (SELECT COUNT(*) FROM spots s WHERE s.reporter_person_id = p.id AND s.status = 'published') AS reported
         FROM people p ORDER BY placed DESC, reported DESC, p.display_name`,
    ).all<Omit<PersonSummary, "instagram"> & { instagram: string | null }>();
    const body: PersonSummary[] = results.filter((p) => p.placed > 0 || p.reported > 0).map(({ instagram, ...p }) => (instagram ? { ...p, instagram } : p));
    return { body, etag: `W/"people-${body.map((p) => `${p.name}${p.placed}.${p.reported}${p.instagram ?? ""}`).join("|")}"` };
  }, FIVE_MIN),
);

catalog.get("/stats", (c) =>
  cachedJson(c, async () => {
    const db = c.env.DB;
    const [totals, types, placers, countries, months, countriesPerPlacer] = await db.batch([
      db.prepare("SELECT COUNT(*) AS spots, COUNT(DISTINCT country_code) AS countries, MAX(updated_at) AS updated, SUM(reporter_person_id IS NULL) AS unknown_placers FROM spots WHERE status = 'published'"),
      db.prepare(`SELECT t.slug, t.label, COUNT(s.id) AS count FROM sticker_types t
                    LEFT JOIN spot_types st ON st.type_slug = t.slug LEFT JOIN spots s ON s.id = st.spot_id AND s.status = 'published'
                   WHERE t.is_active = 1 GROUP BY t.slug ORDER BY t.sort_order`),
      db.prepare(`SELECT p.display_name AS name, COUNT(DISTINCT s.id) AS count FROM spot_placers sp JOIN people p ON p.id = sp.person_id
                    JOIN spots s ON s.id = sp.spot_id AND s.status = 'published' GROUP BY p.id ORDER BY count DESC, name LIMIT 50`),
      db.prepare(`SELECT country_code AS code, country AS name, COUNT(*) AS count FROM spots WHERE status = 'published' AND country_code IS NOT NULL
                   GROUP BY country_code ORDER BY count DESC`),
      db.prepare("SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count FROM spots WHERE status = 'published' GROUP BY month ORDER BY month"),
      db.prepare(`SELECT p.display_name AS name, COUNT(DISTINCT s.country_code) AS countries FROM spot_placers sp JOIN people p ON p.id = sp.person_id
                    JOIN spots s ON s.id = sp.spot_id AND s.status = 'published' AND s.country_code IS NOT NULL GROUP BY p.id`),
    ]);
    const t = (totals?.results[0] ?? { spots: 0, countries: 0, updated: "", unknown_placers: 0 }) as { spots: number; countries: number; updated: string | null; unknown_placers: number | null };
    const perPlacer = new Map(((countriesPerPlacer?.results ?? []) as { name: string; countries: number }[]).map((r) => [r.name, r.countries]));
    const body = {
      total_spots: t.spots, total_countries: t.countries, unknown_placers: t.unknown_placers ?? 0, types: types?.results ?? [],
      placers: ((placers?.results ?? []) as { name: string; count: number }[]).map((p) => ({ ...p, countries: perPlacer.get(p.name) ?? 0 })),
      countries: countries?.results ?? [], months: months?.results ?? [],
    };
    return { body, etag: `W/"stats-${t.updated ?? ""}-${t.spots}"` };
  }, FIVE_MIN),
);

catalog.get("/config", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const isAdmin = !!(await adminFromRequest(c.env, c.req.raw));
  const flag = (v: string | undefined) => {
    const f = (v ?? "off") as FeatureFlag;
    return f === "on" || (f === "admin" && isAdmin);
  };
  const body: AppConfig = {
    default_lang: (s.default_lang ?? "es") as Lang,
    moderation_mode: (s.moderation_mode ?? "open") as ModerationMode,
    turnstile_sitekey: c.env.PUBLIC_TURNSTILE_SITEKEY,
    map_style_url: s.map_style_url ?? "https://tiles.openfreemap.org/styles/liberty",
    features: { video: flag(s.feature_video), instagram: flag(s.feature_instagram), sightings: flag(s.feature_sightings), globe_wrapped: flag(s.feature_globe_wrapped) },
  };
  // depends on who asks (admin-only flags), so never shared
  return c.json(body, 200, { "Cache-Control": "private, max-age=60" });
});

// ── F4 ────────────────────────────────────────────────────────────────────

/** The nearest published, not-dead stickers to a point: a bounding box first (indexed lat/lng), then exact distances. */
catalog.get("/nearby", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return c.json({ error: "bad_position" }, 400);
  const limit = Math.min(20, Math.max(1, Math.floor(Number(c.req.query("limit") ?? 10)) || 10));
  type Row = { id: string; lat: number; lng: number; place_name: string | null; country_code: string | null; thumb_key: string | null; life_status: string; reporter: string | null };
  let rows: Row[] = [];
  // widen the box until it holds enough spots: ~5 km, ~55 km, ~550 km, then everything
  for (const delta of [0.05, 0.5, 5, 360]) {
    const lngSpan = delta === 360 ? 360 : Math.min(360, delta / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const res = await c.env.DB
      .prepare(
        `SELECT s.id, s.lat, s.lng, s.place_name, s.country_code, s.thumb_key, s.life_status, p.display_name AS reporter
           FROM spots s LEFT JOIN people p ON p.id = s.reporter_person_id
          WHERE s.status = 'published' AND s.life_status != 'dead' AND s.lat BETWEEN ?1 AND ?2 AND s.lng BETWEEN ?3 AND ?4`,
      )
      .bind(lat - delta, lat + delta, lng - lngSpan, lng + lngSpan)
      .all<Row>();
    rows = res.results;
    if (rows.length >= limit) break;
  }
  const ranked = rows
    .map((r) => ({ r, d: haversineMeters(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
  const ids = ranked.map((x) => x.r.id);
  const types = ids.length
    ? await c.env.DB.prepare("SELECT spot_id AS id, type_slug AS slug FROM spot_types WHERE spot_id IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(ids)).all<{ id: string; slug: string }>()
    : { results: [] as { id: string; slug: string }[] };
  const body = ranked.map(({ r, d }) => ({
    id: r.id, lat: r.lat, lng: r.lng, distance_m: Math.round(d), bearing: Math.round(bearingDegrees(lat, lng, r.lat, r.lng)),
    place_name: r.place_name || null, country_code: r.country_code, thumb: r.thumb_key ? `/img/${r.thumb_key}` : null, life: r.life_status,
    reporter: r.reporter, types: types.results.filter((t) => t.id === r.id).map((t) => t.slug),
  }));
  return c.json(body, 200, { "Cache-Control": "private, no-store" });
});

/** Longevity stats (F4): oldest living, average survival by type and city, the cemetery and survival curves. */
catalog.get("/stats/longevity", (c) =>
  cachedJson(c, async () => {
    const { results } = await c.env.DB
      .prepare(
        `SELECT s.id, s.place_name, s.city, s.country_code, s.taken_at, s.created_at, s.life_status, s.last_seen_at, s.died_at,
                (SELECT group_concat(st.type_slug) FROM spot_types st WHERE st.spot_id = s.id) AS types, p.display_name AS reporter
           FROM spots s LEFT JOIN people p ON p.id = s.reporter_person_id WHERE s.status = 'published'`,
      )
      .all<{ id: string; place_name: string | null; city: string | null; country_code: string | null; taken_at: string | null; created_at: string; life_status: string; last_seen_at: string | null; died_at: string | null; types: string | null; reporter: string | null }>();
    const typeLabels = new Map((await c.env.DB.prepare("SELECT slug, label FROM sticker_types").all<{ slug: string; label: string }>()).results.map((t) => [t.slug, t.label]));
    const now = Date.now();
    const rows = results.map((r) => {
      const placed = placedAtOf(r.taken_at, r.created_at);
      const dead = r.life_status === "dead";
      return { ...r, placed, dead, days: survivalDays(placed, { diedAt: r.died_at, lastSeenAt: r.last_seen_at }, now), age: ageDays(placed, now), slugs: r.types ? r.types.split(",") : [] };
    });
    const brief = (r: (typeof rows)[number]) => ({ id: r.id, place_name: r.place_name || r.city || null, country_code: r.country_code, types: r.slugs, reporter: r.reporter });
    const oldestLiving = rows.filter((r) => !r.dead).sort((a, b) => b.age - a.age).slice(0, 5).map((r) => ({ ...brief(r), age_days: r.age }));
    const cemetery = rows.filter((r) => r.dead).sort((a, b) => (b.died_at ?? "").localeCompare(a.died_at ?? "")).slice(0, 10).map((r) => ({ ...brief(r), died_at: r.died_at, days: r.days }));
    const byType = averageBy(rows.flatMap((r) => r.slugs.map((slug) => ({ key: slug, label: typeLabels.get(slug) ?? slug, days: r.days }))), 1);
    const byCity = averageBy(rows.filter((r) => r.city).map((r) => ({ key: `${r.country_code ?? ""}:${r.city}`, label: r.city!, days: r.days })), 3).slice(0, 8);
    const lifetime = (r: (typeof rows)[number]) => ({ days: r.dead ? r.days : r.age, dead: r.dead });
    const curves = [{ key: "all", label: "all", points: survivalCurve(rows.map(lifetime)) }];
    for (const slug of typeLabels.keys()) {
      const group = rows.filter((r) => r.slugs.includes(slug));
      if (group.length >= 5) curves.push({ key: slug, label: typeLabels.get(slug) ?? slug, points: survivalCurve(group.map(lifetime)) });
    }
    const body = {
      totals: { alive: rows.filter((r) => r.life_status === "alive").length, unknown: rows.filter((r) => r.life_status === "unknown").length, dead: rows.filter((r) => r.dead).length },
      oldest_living: oldestLiving, by_type: byType, by_city: byCity, cemetery, curves,
    };
    const stamp = `${rows.length}-${body.totals.dead}-${body.totals.unknown}-${rows.map((r) => r.died_at ?? r.last_seen_at ?? "").sort().at(-1) ?? ""}`;
    return { body, etag: `W/"longevity-${stamp}-${new Date(now).toISOString().slice(0, 10)}"` };
  }, FIVE_MIN),
);
