import { computeLife, placedAtOf, type Life, type SightingLite } from "../../src/shared/life";

/** Recompute a spot's life from its sightings and store it (cheap: one spot, a handful of rows). */
export async function refreshLife(db: D1Database, spotId: string, now = Date.now()): Promise<Life | null> {
  const mode = await db.prepare("SELECT value FROM settings WHERE key = 'moderation_mode'").first<{ value: string }>();
  const spot = await db.prepare("SELECT taken_at, created_at FROM spots WHERE id = ?1").bind(spotId).first<{ taken_at: string | null; created_at: string }>();
  if (!spot) return null;
  const { results } = await db.prepare("SELECT status, created_at, status_review AS review, COALESCE(submitter_ip_hash, reporter_raw) AS by FROM sightings WHERE spot_id = ?1").bind(spotId).all<SightingLite>();
  const life = computeLife(placedAtOf(spot.taken_at, spot.created_at), results, now, mode?.value === "approval");
  await db
    .prepare("UPDATE spots SET life_status = ?2, last_seen_at = ?3, died_at = ?4, sightings_count = ?5, updated_at = ?6 WHERE id = ?1")
    .bind(spotId, life.status, life.lastSeenAt, life.diedAt, life.count, new Date(now).toISOString())
    .run();
  return life;
}

/** Daily job: a living spot nobody has seen for 12 months becomes "sin noticias" (one UPDATE, well inside the free CPU limit). */
export async function flipStaleSpots(db: D1Database, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - 365 * 86_400_000).toISOString();
  const res = await db
    .prepare("UPDATE spots SET life_status = 'unknown' WHERE life_status = 'alive' AND status = 'published' AND COALESCE(last_seen_at, taken_at, created_at) < ?1")
    .bind(cutoff)
    .run();
  return res.meta.changes ?? 0;
}
