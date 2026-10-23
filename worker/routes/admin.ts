import { Hono } from "hono";
import { z } from "zod";
import { round3 } from "../../src/shared/geo";
import type { AppEnv } from "../app";
import { adminFromRequest } from "../lib/access";
import { bustSpotsCache } from "../lib/cache";
import { sha256Hex } from "../lib/crypto";
import { CONTENT_TYPE, sniffImage } from "../lib/images";
import { findOrCreatePeople, findOrCreatePerson } from "../lib/people";
import { meterStatement } from "../lib/r2";

/** Everything under /api/admin/*: Cloudflare Access JWT required (BUILD.md §7.4, §8). */
export const admin = new Hono<AppEnv & { Variables: { email: string } }>();

admin.use("*", async (c, next) => {
  const who = await adminFromRequest(c.env, c.req.raw);
  if (!who) return c.json({ error: "unauthorized" }, 401);
  c.set("email", who.email);
  await next();
});

const actor = (email: string) => `admin:${email}`;
const audit = (db: D1Database, email: string, action: string, entity: string, entityId: string, diff?: unknown) =>
  db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(actor(email), action, entity, entityId, diff === undefined ? null : JSON.stringify(diff));
const now = () => new Date().toISOString();

admin.get("/me", (c) => c.json({ email: c.get("email") }));

// ── spots: list / export ──────────────────────────────────────────────────

const SORTS: Record<string, string> = {
  created_at: "s.created_at", updated_at: "s.updated_at", place: "s.place_name", status: "s.status", reporter: "rp.display_name", country: "s.country_code",
};

interface ListParams { where: string; binds: unknown[]; order: string }

function listParams(q: URLSearchParams): ListParams {
  const where: string[] = [];
  const binds: unknown[] = [];
  const bind = (v: unknown) => { binds.push(v); return `?${binds.length}`; };
  const status = q.get("status");
  if (status === "queue") where.push("(s.needs_review = 1 OR s.status = 'pending') AND s.status != 'hidden'");
  else if (status === "trash") where.push("s.status = 'hidden' AND s.review_reason = 'deleted'");
  else if (status === "hidden") where.push("s.status = 'hidden'");
  else if (status === "published" || status === "pending") where.push(`s.status = ${bind(status)}`);
  const reason = q.get("reason");
  if (reason) where.push(`(',' || COALESCE(s.review_reason, '') || ',') LIKE ${bind(`%,${reason},%`)}`);
  if (q.get("placer") === "unknown") where.push("s.placer_status = 'unknown'");
  const type = q.get("type");
  if (type) where.push(`EXISTS (SELECT 1 FROM spot_types st WHERE st.spot_id = s.id AND st.type_slug = ${bind(type)})`);
  const country = q.get("country");
  if (country) where.push(`s.country_code = ${bind(country.toLowerCase())}`);
  const batch = q.get("batch");
  if (batch) where.push(batch === "any" ? "s.batch_id IS NOT NULL" : `s.batch_id = ${bind(batch)}`);
  const text = q.get("q")?.trim();
  if (text) {
    const like = bind(`%${text}%`);
    where.push(`(s.id LIKE ${like} OR s.place_name LIKE ${like} OR s.note LIKE ${like} OR s.legacy_filename LIKE ${like} OR rp.display_name LIKE ${like} OR s.legacy_objectids LIKE ${like})`);
  }
  const sort = SORTS[q.get("sort") ?? "created_at"] ?? SORTS.created_at!;
  const dir = q.get("dir") === "asc" ? "ASC" : "DESC";
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", binds, order: `ORDER BY ${sort} ${dir}, s.id` };
}

interface AdminSpotRow {
  id: string; lat: number; lng: number; status: string; needs_review: number; review_reason: string | null; placer_status: string; placer_note: string | null;
  place_name: string | null; country: string | null; country_code: string | null; created_at: string; updated_at: string; taken_at: string | null;
  photo_key: string | null; thumb_key: string | null; orig_key: string | null; batch_id: string | null; legacy_objectids: string | null; legacy_filename: string | null;
  location_source: string; is_approximate: number; note: string | null; other_text: string | null; reporter: string | null; photo_sha256: string | null;
}

async function adminSpots(db: D1Database, q: URLSearchParams, unlimited: boolean) {
  const { where, binds, order } = listParams(q);
  const limit = unlimited ? 5000 : Math.min(Math.max(Number(q.get("limit") ?? 50) || 50, 1), 1000);
  const offset = unlimited ? 0 : Math.max(Number(q.get("offset") ?? 0) || 0, 0);
  const from = `FROM spots s LEFT JOIN people rp ON rp.id = s.reporter_person_id ${where}`;
  const [rows, count] = await db.batch([
    db.prepare(
      `SELECT s.id, s.lat, s.lng, s.status, s.needs_review, s.review_reason, s.placer_status, s.placer_note, s.place_name, s.country, s.country_code, s.created_at, s.updated_at,
              s.taken_at, s.photo_key, s.thumb_key, s.orig_key, s.batch_id, s.legacy_objectids, s.legacy_filename, s.location_source, s.is_approximate, s.note, s.other_text,
              s.photo_sha256, rp.display_name AS reporter ${from} ${order} LIMIT ${limit} OFFSET ${offset}`,
    ).bind(...binds),
    db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...binds),
  ]);
  const list = (rows?.results ?? []) as unknown as AdminSpotRow[];
  const ids = JSON.stringify(list.map((r) => r.id));
  const [types, placers] = await db.batch([
    db.prepare("SELECT spot_id AS id, type_slug AS v FROM spot_types WHERE spot_id IN (SELECT value FROM json_each(?1))").bind(ids),
    db.prepare("SELECT sp.spot_id AS id, p.display_name AS v FROM spot_placers sp JOIN people p ON p.id = sp.person_id WHERE sp.spot_id IN (SELECT value FROM json_each(?1)) ORDER BY p.display_name").bind(ids),
  ]);
  const group = (r: unknown[] | undefined) => {
    const m = new Map<string, string[]>();
    for (const x of (r ?? []) as { id: string; v: string }[]) m.set(x.id, [...(m.get(x.id) ?? []), x.v]);
    return m;
  };
  const t = group(types?.results);
  const p = group(placers?.results);
  return {
    total: ((count?.results[0] as { n: number } | undefined)?.n) ?? 0,
    rows: list.map((r) => ({
      id: r.id, lat: r.lat, lng: r.lng, status: r.status, needs_review: r.needs_review === 1,
      review_reasons: r.review_reason ? r.review_reason.split(",") : [], types: t.get(r.id) ?? [], placers: p.get(r.id) ?? [], placer_status: r.placer_status,
      placer_note: r.placer_note, reporter: r.reporter, place_name: r.place_name || null, country: r.country, country_code: r.country_code, created_at: r.created_at,
      updated_at: r.updated_at, taken_at: r.taken_at, thumb: r.thumb_key ? `/img/${r.thumb_key}` : null, photo: r.photo_key ? `/img/${r.photo_key}` : null,
      has_original: !!r.orig_key, batch_id: r.batch_id, legacy_objectids: r.legacy_objectids ? (JSON.parse(r.legacy_objectids) as number[]) : [],
      legacy_filename: r.legacy_filename, location_source: r.location_source, is_approximate: r.is_approximate === 1, note: r.note, other_text: r.other_text,
    })),
  };
}

admin.get("/spots", async (c) => c.json(await adminSpots(c.env.DB, new URL(c.req.url).searchParams, false)));

/** Spreadsheet apps run text starting with = + - @ as a formula: neutralise it in CSV exports. */
const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // numbers (negative coordinates) are not formulas
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

admin.get("/export", async (c) => {
  const url = new URL(c.req.url);
  const format = url.searchParams.get("format") === "geojson" ? "geojson" : "csv";
  const { rows } = await adminSpots(c.env.DB, url.searchParams, true);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "geojson") {
    const body = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature", id: r.id, geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: { ...r, types: r.types.join(";"), placers: r.placers.join(";"), review_reasons: r.review_reasons.join(";"), legacy_objectids: r.legacy_objectids.join(";") },
      })),
    };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/geo+json", "Content-Disposition": `attachment; filename="stickermap-${stamp}.geojson"` } });
  }
  const cols = ["id", "lat", "lng", "types", "placer_status", "placers", "reporter", "place_name", "country_code", "taken_at", "created_at", "status", "needs_review", "review_reasons", "location_source", "note", "legacy_objectids", "photo"] as const;
  const lines = [cols.join(","), ...rows.map((r) => cols.map((k) => {
    const v = r[k as keyof typeof r];
    return csvCell(Array.isArray(v) ? v.join(";") : v);
  }).join(","))];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stickermap-${stamp}.csv"` } });
});

// ── spots: edit ───────────────────────────────────────────────────────────

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const name = z.string().trim().min(1).max(255);

const adminPatch = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  types: z.array(slug).min(1).max(12).optional(),
  reporter: name.nullish(),
  placer_status: z.enum(["self", "other", "unknown"]).optional(),
  placers: z.array(name).max(10).optional(),
  placer_note: z.string().trim().max(140).nullish(),
  note: z.string().trim().max(280).nullish(),
  other_text: z.string().trim().max(40).nullish(),
  place_name: z.string().trim().max(200).nullish(),
  status: z.enum(["published", "pending", "hidden"]).optional(),
  needs_review: z.boolean().optional(),
  review_reason: z.string().max(200).nullish(),
  is_approximate: z.boolean().optional(),
  location_source: z.enum(["exif", "device", "pin", "search", "paste", "legacy"]).optional(),
}).strict();

admin.get("/spots/:id", async (c) => {
  const out = await adminSpots(c.env.DB, new URLSearchParams({ q: c.req.param("id"), limit: "1" }), false);
  const row = out.rows.find((r) => r.id === c.req.param("id"));
  return row ? c.json(row) : c.json({ error: "not_found" }, 404);
});

admin.patch("/spots/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = adminPatch.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const p = parsed.data;
  const db = c.env.DB;
  const spot = await db.prepare("SELECT id, reporter_person_id AS rid FROM spots WHERE id = ?1").bind(id).first<{ id: string; rid: number | null }>();
  if (!spot) return c.json({ error: "not_found" }, 404);
  if ((p.lat === undefined) !== (p.lng === undefined)) return c.json({ error: "lat_lng_together" }, 400);

  const sets: string[] = ["updated_at = ?2"];
  const binds: unknown[] = [id, now()];
  const set = (col: string, value: unknown) => { binds.push(value); sets.push(`${col} = ?${binds.length}`); };
  const extra: D1PreparedStatement[] = [];

  if (p.lat !== undefined && p.lng !== undefined) {
    const approx = p.is_approximate ?? false;
    set("lat", approx ? round3(p.lat) : p.lat);
    set("lng", approx ? round3(p.lng) : p.lng);
    set("location_source", p.location_source ?? "pin");
    // coordinates changed: the geocoded name no longer applies, let the cron look it up again
    if (p.place_name === undefined) { set("place_name", null); set("city", null); set("country", null); set("country_code", null); }
  }
  if (p.is_approximate !== undefined) set("is_approximate", p.is_approximate ? 1 : 0);
  let reporterId = spot.rid;
  if (p.reporter !== undefined) {
    reporterId = p.reporter ? await findOrCreatePerson(db, p.reporter) : null;
    set("reporter_person_id", reporterId);
    set("reporter_raw", p.reporter ?? null);
  }
  for (const [k, col] of [["placer_note", "placer_note"], ["note", "note"], ["other_text", "other_text"], ["place_name", "place_name"], ["review_reason", "review_reason"]] as const) {
    if (p[k] !== undefined) set(col, p[k] ?? null);
  }
  if (p.status) set("status", p.status);
  if (p.needs_review !== undefined) {
    set("needs_review", p.needs_review ? 1 : 0);
    if (!p.needs_review && p.review_reason === undefined) set("review_reason", null);
  }
  if (p.placer_status !== undefined) {
    set("placer_status", p.placer_status);
    extra.push(db.prepare("DELETE FROM spot_placers WHERE spot_id = ?1").bind(id));
    if (p.placer_status === "other") {
      if (!p.placers?.length) return c.json({ error: "other_requires_names" }, 400);
      for (const pid of await findOrCreatePeople(db, p.placers)) extra.push(db.prepare("INSERT INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(id, pid));
    } else if (p.placer_status === "self") {
      if (!reporterId) return c.json({ error: "self_requires_reporter" }, 400);
      extra.push(db.prepare("INSERT INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(id, reporterId));
    }
  }
  if (p.types) {
    const have = await db.prepare(`SELECT COUNT(*) AS n FROM sticker_types WHERE slug IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(p.types)).first<{ n: number }>();
    if (have?.n !== new Set(p.types).size) return c.json({ error: "unknown_type" }, 400);
    extra.push(db.prepare("DELETE FROM spot_types WHERE spot_id = ?1").bind(id));
    for (const t of new Set(p.types)) extra.push(db.prepare("INSERT INTO spot_types (spot_id, type_slug) VALUES (?1, ?2)").bind(id, t));
  }
  await db.batch([db.prepare(`UPDATE spots SET ${sets.join(", ")} WHERE id = ?1`).bind(...binds), ...extra, audit(db, c.get("email"), "update", "spot", id, p)]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id });
});

const bulkBody = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(500),
  action: z.enum(["approve", "hide", "delete", "restore", "clear_review", "assign_placers", "set_types", "fuzz"]),
  placers: z.array(name).max(10).optional(),
  types: z.array(slug).min(1).max(12).optional(),
});

admin.post("/spots/bulk", async (c) => {
  const parsed = bulkBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const { ids, action, placers, types } = parsed.data;
  const db = c.env.DB;
  const json = JSON.stringify(ids);
  const t = now();
  const where = "WHERE id IN (SELECT value FROM json_each(?1))";
  const stmts: D1PreparedStatement[] = [];
  switch (action) {
    case "approve":
      stmts.push(db.prepare(`UPDATE spots SET status = 'published', needs_review = 0, review_reason = NULL, updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "restore":
      stmts.push(db.prepare(`UPDATE spots SET status = 'published', review_reason = NULL, updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "hide":
      stmts.push(db.prepare(`UPDATE spots SET status = 'hidden', updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "delete": // soft delete: nothing is ever purged (Papelera view can restore it)
      stmts.push(db.prepare(`UPDATE spots SET status = 'hidden', needs_review = 0, review_reason = 'deleted', updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "clear_review":
      stmts.push(db.prepare(`UPDATE spots SET needs_review = 0, review_reason = NULL, updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "fuzz":
      stmts.push(db.prepare(`UPDATE spots SET lat = ROUND(lat, 3), lng = ROUND(lng, 3), is_approximate = 1, updated_at = ?2 ${where}`).bind(json, t));
      break;
    case "assign_placers": {
      if (!placers?.length) return c.json({ error: "placers_required" }, 400);
      const pids = await findOrCreatePeople(db, placers);
      stmts.push(db.prepare(`DELETE FROM spot_placers WHERE spot_id IN (SELECT value FROM json_each(?1))`).bind(json));
      for (const pid of pids) {
        stmts.push(db.prepare(`INSERT OR IGNORE INTO spot_placers (spot_id, person_id) SELECT id, ?2 FROM spots ${where}`).bind(json, pid));
      }
      stmts.push(db.prepare(
        `UPDATE spots SET placer_status = 'other', updated_at = ?2,
                review_reason = NULLIF(REPLACE(REPLACE(',' || COALESCE(review_reason, '') || ',', ',know_placer,', ','), ',,', ','), ','),
                needs_review = CASE WHEN review_reason = 'know_placer' THEN 0 ELSE needs_review END ${where}`,
      ).bind(json, t));
      break;
    }
    case "set_types": {
      if (!types) return c.json({ error: "types_required" }, 400);
      stmts.push(db.prepare(`DELETE FROM spot_types WHERE spot_id IN (SELECT value FROM json_each(?1))`).bind(json));
      for (const slugValue of new Set(types)) stmts.push(db.prepare(`INSERT INTO spot_types (spot_id, type_slug) SELECT id, ?2 FROM spots ${where}`).bind(json, slugValue));
      stmts.push(db.prepare(`UPDATE spots SET updated_at = ?2 ${where}`).bind(json, t));
      break;
    }
  }
  stmts.push(audit(db, c.get("email"), `bulk_${action}`, "spot", ids.length === 1 ? ids[0]! : `${ids.length} spots`, { ids: ids.slice(0, 50), placers, types }));
  await db.batch(stmts);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ ok: true, count: ids.length });
});

admin.get("/spots/:id/original", async (c) => {
  const row = await c.env.DB.prepare("SELECT orig_key FROM spots WHERE id = ?1").bind(c.req.param("id")).first<{ orig_key: string | null }>();
  if (!row?.orig_key) return c.json({ error: "not_found" }, 404);
  const object = await c.env.PHOTOS.get(row.orig_key);
  if (!object) return c.json({ error: "not_found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename="${row.orig_key.split("/").pop()}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
});

// ── sticker types ─────────────────────────────────────────────────────────

const typeFields = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fit: z.enum(["cover", "contain"]).optional(),
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
  allows_text: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
});

async function storeIcon(c: { env: AppEnv["Bindings"] }, file: unknown, slugValue: string): Promise<{ key: string; bytes: number } | "bad_icon" | null> {
  if (!file || typeof file === "string") return null;
  const f = file as File;
  if (f.size === 0) return null;
  if (f.size > 600_000) return "bad_icon";
  const bytes = await f.arrayBuffer();
  const kind = sniffImage(new Uint8Array(bytes, 0, 32));
  if (kind !== "png" && kind !== "webp") return "bad_icon";
  // content-addressed key: replacing an icon never serves a stale cached copy
  const key = `icons/${slugValue}-${(await sha256Hex(bytes)).slice(0, 8)}.${kind === "png" ? "png" : "webp"}`;
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: CONTENT_TYPE[kind] } });
  return { key, bytes: bytes.byteLength };
}

admin.get("/types", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, (SELECT COUNT(*) FROM spot_types st WHERE st.type_slug = t.slug) AS count FROM sticker_types t ORDER BY t.sort_order, t.slug`,
  ).all<Record<string, unknown>>();
  return c.json(results.map((r) => ({ ...r, icon: `/img/${r.icon_key as string}`, allows_text: r.allows_text === 1, is_active: r.is_active === 1 })));
});

admin.post("/types", async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "bad_request" }, 400);
  const slugValue = slug.safeParse(String(form.get("slug") ?? ""));
  const fields = typeFields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!slugValue.success || !fields.success || !fields.data.label) return c.json({ error: "invalid" }, 400);
  if (await c.env.DB.prepare("SELECT 1 FROM sticker_types WHERE slug = ?1").bind(slugValue.data).first()) return c.json({ error: "slug_exists" }, 409);
  const icon = await storeIcon(c, form.get("icon"), slugValue.data);
  if (!icon || icon === "bad_icon") return c.json({ error: "icon_required" }, 400);
  const f = fields.data;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sticker_types (slug, label, icon_key, color, fit, sort_order, allows_text, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(slugValue.data, f.label, icon.key, f.color ?? "#31872E", f.fit ?? "contain", f.sort_order ?? 50, f.allows_text ? 1 : 0, f.is_active === false ? 0 : 1),
    meterStatement(c.env.DB, icon.bytes),
    audit(c.env.DB, c.get("email"), "add_type", "sticker_type", slugValue.data, f),
  ]);
  return c.json({ slug: slugValue.data }, 201);
});

admin.patch("/types/:slug", async (c) => {
  const slugValue = c.req.param("slug");
  if (!(await c.env.DB.prepare("SELECT 1 FROM sticker_types WHERE slug = ?1").bind(slugValue).first())) return c.json({ error: "not_found" }, 404);
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "bad_request" }, 400);
  const fields = typeFields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!fields.success) return c.json({ error: "invalid" }, 400);
  const icon = await storeIcon(c, form.get("icon"), slugValue);
  if (icon === "bad_icon") return c.json({ error: "bad_icon" }, 400);
  const f = fields.data;
  const sets: string[] = [];
  const binds: unknown[] = [slugValue];
  const set = (col: string, v: unknown) => { binds.push(v); sets.push(`${col} = ?${binds.length}`); };
  if (f.label !== undefined) set("label", f.label);
  if (f.color !== undefined) set("color", f.color);
  if (f.fit !== undefined) set("fit", f.fit);
  if (f.sort_order !== undefined) set("sort_order", f.sort_order);
  if (f.allows_text !== undefined) set("allows_text", f.allows_text ? 1 : 0);
  if (f.is_active !== undefined) set("is_active", f.is_active ? 1 : 0);
  if (icon) set("icon_key", icon.key);
  const stmts = [audit(c.env.DB, c.get("email"), "update_type", "sticker_type", slugValue, f)];
  if (sets.length) stmts.unshift(c.env.DB.prepare(`UPDATE sticker_types SET ${sets.join(", ")} WHERE slug = ?1`).bind(...binds));
  if (icon) stmts.push(meterStatement(c.env.DB, icon.bytes));
  await c.env.DB.batch(stmts);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ slug: slugValue });
});

/** Promote an "Otro" free-text value to a real type and re-tag every spot that used it. */
admin.post("/types/promote", async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "bad_request" }, 400);
  const text = String(form.get("text") ?? "").trim();
  const slugValue = slug.safeParse(String(form.get("slug") ?? ""));
  const label = String(form.get("label") ?? text).trim();
  if (!text || !slugValue.success || !label) return c.json({ error: "invalid" }, 400);
  if (await c.env.DB.prepare("SELECT 1 FROM sticker_types WHERE slug = ?1").bind(slugValue.data).first()) return c.json({ error: "slug_exists" }, 409);
  const icon = await storeIcon(c, form.get("icon"), slugValue.data);
  if (!icon || icon === "bad_icon") return c.json({ error: "icon_required" }, 400);
  const db = c.env.DB;
  const match = "spot_id IN (SELECT id FROM spots WHERE other_text = ?1 COLLATE NOCASE)";
  const retag = await db.prepare("SELECT COUNT(*) AS n FROM spots WHERE other_text = ?1 COLLATE NOCASE").bind(text).first<{ n: number }>();
  await db.batch([
    db.prepare("INSERT INTO sticker_types (slug, label, icon_key, sort_order) VALUES (?1, ?2, ?3, 50)").bind(slugValue.data, label, icon.key),
    db.prepare(`INSERT OR IGNORE INTO spot_types (spot_id, type_slug) SELECT id, ?2 FROM spots WHERE other_text = ?1 COLLATE NOCASE`).bind(text, slugValue.data),
    db.prepare(`DELETE FROM spot_types WHERE type_slug = 'otro' AND ${match}`).bind(text),
    db.prepare("UPDATE spots SET other_text = NULL, updated_at = ?2 WHERE other_text = ?1 COLLATE NOCASE").bind(text, now()),
    meterStatement(db, icon.bytes),
    audit(db, c.get("email"), "promote_type", "sticker_type", slugValue.data, { text, spots: retag?.n ?? 0 }),
  ]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ slug: slugValue.data, retagged: retag?.n ?? 0 }, 201);
});

// ── people ────────────────────────────────────────────────────────────────

admin.get("/people", async (c) => {
  const db = c.env.DB;
  const [people, aliases] = await db.batch([
    db.prepare(
      `SELECT p.id, p.display_name AS name,
              (SELECT COUNT(*) FROM spot_placers sp WHERE sp.person_id = p.id) AS placed,
              (SELECT COUNT(*) FROM spots s WHERE s.reporter_person_id = p.id) AS reported
         FROM people p ORDER BY placed DESC, reported DESC, p.display_name`,
    ),
    db.prepare("SELECT alias, person_id FROM people_aliases"),
  ]);
  const byPerson = new Map<number, string[]>();
  for (const a of (aliases?.results ?? []) as { alias: string; person_id: number }[]) byPerson.set(a.person_id, [...(byPerson.get(a.person_id) ?? []), a.alias]);
  return c.json(((people?.results ?? []) as { id: number; name: string; placed: number; reported: number }[]).map((p) => ({ ...p, aliases: byPerson.get(p.id) ?? [] })));
});

admin.post("/people/merge", async (c) => {
  const parsed = z.object({ from_id: z.number().int(), into_id: z.number().int() }).refine((v) => v.from_id !== v.into_id).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const { from_id, into_id } = parsed.data;
  const db = c.env.DB;
  const [from, into] = await Promise.all([
    db.prepare("SELECT display_name FROM people WHERE id = ?1").bind(from_id).first<{ display_name: string }>(),
    db.prepare("SELECT display_name FROM people WHERE id = ?1").bind(into_id).first<{ display_name: string }>(),
  ]);
  if (!from || !into) return c.json({ error: "not_found" }, 404);
  await db.batch([
    db.prepare("UPDATE spots SET reporter_person_id = ?2, updated_at = ?3 WHERE reporter_person_id = ?1").bind(from_id, into_id, now()),
    db.prepare("INSERT OR IGNORE INTO spot_placers (spot_id, person_id) SELECT spot_id, ?2 FROM spot_placers WHERE person_id = ?1").bind(from_id, into_id),
    db.prepare("DELETE FROM spot_placers WHERE person_id = ?1").bind(from_id),
    db.prepare("UPDATE people_aliases SET person_id = ?2 WHERE person_id = ?1").bind(from_id, into_id),
    db.prepare("INSERT OR IGNORE INTO people_aliases (alias, person_id) VALUES (?1, ?2)").bind(from.display_name, into_id),
    db.prepare("DELETE FROM people WHERE id = ?1").bind(from_id),
    audit(db, c.get("email"), "merge_people", "person", String(into_id), { from: from.display_name, into: into.display_name }),
  ]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id: into_id });
});

admin.patch("/people/:id", async (c) => {
  const parsed = z.object({ display_name: name }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const id = Number(c.req.param("id"));
  const clash = await c.env.DB.prepare("SELECT id FROM people WHERE display_name = ?1 AND id != ?2").bind(parsed.data.display_name, id).first();
  if (clash) return c.json({ error: "name_exists" }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE people SET display_name = ?2 WHERE id = ?1").bind(id, parsed.data.display_name),
    c.env.DB.prepare("INSERT OR IGNORE INTO people_aliases (alias, person_id) VALUES (?1, ?2)").bind(parsed.data.display_name, id),
    audit(c.env.DB, c.get("email"), "rename_person", "person", String(id), parsed.data),
  ]);
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id });
});

// ── settings, storage meter, backups, audit ───────────────────────────────

const FLAG = z.enum(["off", "admin", "on"]);
const settingsBody = z.object({
  moderation_mode: z.enum(["open", "approval"]).optional(),
  default_lang: z.enum(["es", "en"]).optional(),
  map_style_url: z.string().url().max(500).optional(),
  feature_video: FLAG.optional(),
  feature_instagram: FLAG.optional(),
  feature_sightings: FLAG.optional(),
  feature_globe_wrapped: FLAG.optional(),
}).strict();

const R2_LIMIT_BYTES = 10 * 1024 ** 3;

async function lastObject(bucket: R2Bucket, prefix: string): Promise<{ key: string; uploaded: string; size: number } | null> {
  let cursor: string | undefined;
  let newest: R2Object | null = null;
  do {
    const page: R2Objects = await bucket.list({ prefix, cursor });
    for (const o of page.objects) if (!newest || o.uploaded > newest.uploaded) newest = o;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return newest ? { key: newest.key, uploaded: newest.uploaded.toISOString(), size: newest.size } : null;
}

admin.get("/settings", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const used = Number(s.r2_bytes ?? 0);
  const [d1, gpkg] = await Promise.all([lastObject(c.env.PHOTOS, "backups/d1/"), lastObject(c.env.PHOTOS, "backups/weekly/")]);
  return c.json({
    settings: s,
    storage: { used_bytes: used, limit_bytes: R2_LIMIT_BYTES, level: used >= 9 * 1024 ** 3 ? "critical" : used >= 7 * 1024 ** 3 ? "warning" : "ok" },
    backups: { d1, gpkg },
  });
});

admin.put("/settings", async (c) => {
  const parsed = settingsBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const entries = Object.entries(parsed.data) as [string, string][];
  if (!entries.length) return c.json({ ok: true });
  await c.env.DB.batch([
    ...entries.map(([k, v]) => c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)),
    audit(c.env.DB, c.get("email"), "update_settings", "settings", "settings", parsed.data),
  ]);
  return c.json({ ok: true });
});

admin.get("/backup/latest", async (c) => {
  const kind = c.req.query("kind") === "gpkg" ? "gpkg" : "d1";
  const latest = await lastObject(c.env.PHOTOS, kind === "gpkg" ? "backups/weekly/" : "backups/d1/");
  if (!latest) return c.json({ error: "no_backup_yet" }, 404);
  const object = await c.env.PHOTOS.get(latest.key);
  if (!object) return c.json({ error: "not_found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename="${latest.key.split("/").pop()}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
});

admin.get("/audit", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const { results } = await c.env.DB.prepare("SELECT id, at, actor, action, entity, entity_id, diff_json FROM audit_log ORDER BY id DESC LIMIT ?1").bind(limit).all();
  return c.json(results);
});
