import { Hono } from "hono";
import type { AppConfig, FeatureFlag, Lang, ModerationMode, PersonSummary, StickerType } from "../../src/shared/types";
import type { AppEnv } from "../app";
import { adminFromRequest } from "../lib/access";
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
