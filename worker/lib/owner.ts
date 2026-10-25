/**
 * Photos and videos are named after a spot id or a sighting id. They are public only while the spot is published and, for a
 * sighting, while an admin has not rejected it.
 */
export async function isPublicOwner(db: D1Database, id: string): Promise<boolean> {
  const spot = await db.prepare("SELECT status FROM spots WHERE id = ?1").bind(id).first<{ status: string }>();
  if (spot) return spot.status === "published";
  const sighting = await db
    .prepare("SELECT s.status AS spot_status, x.status_review AS review FROM sightings x JOIN spots s ON s.id = x.spot_id WHERE x.id = ?1")
    .bind(id)
    .first<{ spot_status: string; review: string }>();
  return !!sighting && sighting.spot_status === "published" && sighting.review !== "rejected";
}
