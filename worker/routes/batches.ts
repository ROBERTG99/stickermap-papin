import { Hono } from "hono";
import { createBatchBody, MAX } from "../../src/shared/schema";
import { newUlid } from "../../src/shared/ulid";
import type { AppEnv } from "../app";
import { bustSpotsCache } from "../lib/cache";
import { adminFromRequest } from "../lib/access";
import { hashToken, randomToken, signBatchToken, timingSafeEqual } from "../lib/crypto";
import { findOrCreatePerson } from "../lib/people";
import { allowed, ipHash, record } from "../lib/ratelimit";
import { verifyTurnstile } from "../lib/turnstile";

export const batches = new Hono<AppEnv>();

const BATCH_TOKEN_MS = 2 * 3_600_000;
const EDIT_WINDOW_MS = 24 * 3_600_000;

/** Start a bulk add: one Turnstile check for the whole batch (BUILD.md §7.3b). */
batches.post("/", async (c) => {
  const parsed = createBatchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  if (!(await verifyTurnstile(c.env, parsed.data.turnstile_token, ip, new URL(c.req.url).hostname))) return c.json({ error: "turnstile_failed" }, 403);
  const ipH = await ipHash(c.env.IP_HASH_SECRET, ip);
  if (!(await allowed(c.env.DB, ipH, "batch"))) return c.json({ error: "rate_limited" }, 429);

  const id = newUlid();
  const editToken = randomToken();
  const now = Date.now();
  const reporterId = parsed.data.reporter ? await findOrCreatePerson(c.env.DB, parsed.data.reporter) : null;
  await c.env.DB.prepare(
    "INSERT INTO batches (id, reporter_person_id, max_spots, edit_token_hash, submitter_ip_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  ).bind(id, reporterId, MAX.batchSpots, await hashToken(editToken), ipH, new Date(now).toISOString(), new Date(now + BATCH_TOKEN_MS).toISOString()).run();
  await record(c.env.DB, ipH, "batch");
  const batchToken = await signBatchToken(c.env.IP_HASH_SECRET, { batchId: id, expiresAt: now + BATCH_TOKEN_MS, max: MAX.batchSpots });
  return c.json({ batchId: id, batchToken, editToken }, 201);
});

/** "Borrar este lote": soft-delete every spot of the batch (24 h, or admin). */
batches.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const batch = await c.env.DB.prepare("SELECT edit_token_hash, created_at FROM batches WHERE id = ?1").bind(id).first<{ edit_token_hash: string; created_at: string }>();
  if (!batch) return c.json({ error: "not_found" }, 404);
  const admin = await adminFromRequest(c.env, c.req.raw);
  if (!admin) {
    const token = c.req.header("X-Edit-Token");
    const fresh = Date.now() - Date.parse(batch.created_at) <= EDIT_WINDOW_MS;
    if (!token || !fresh || !timingSafeEqual(await hashToken(token), batch.edit_token_hash)) return c.json({ error: "forbidden" }, 403);
  }
  const res = await c.env.DB.prepare("UPDATE spots SET status = 'hidden', updated_at = ?2 WHERE batch_id = ?1 AND status != 'hidden'").bind(id, new Date().toISOString()).run();
  await c.env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, diff_json) VALUES (?1, 'hide_batch', 'batch', ?2, ?3)")
    .bind(admin ? `admin:${admin.email}` : "submitter", id, JSON.stringify({ spots: res.meta.changes })).run();
  c.executionCtx.waitUntil(bustSpotsCache(c));
  return c.json({ id, hidden: res.meta.changes });
});
