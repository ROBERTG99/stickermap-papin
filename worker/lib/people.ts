/**
 * People are matched by name. The person who uploads a sticker is also the one who stuck it (decided 2026-10-25), so a spot's
 * placers always mirror its reporter. Names are matched
 * case-insensitively through the alias table first, so an admin merge keeps working for new submissions.
 * Nothing is fuzzy-merged automatically (BUILD.md §1.6.4).
 */
export async function findOrCreatePerson(db: D1Database, rawName: string): Promise<number> {
  const name = rawName.trim();
  const viaAlias = await db.prepare("SELECT person_id AS id FROM people_aliases WHERE alias = ?1").bind(name).first<{ id: number }>();
  if (viaAlias) return viaAlias.id;
  const existing = await db.prepare("SELECT id FROM people WHERE display_name = ?1").bind(name).first<{ id: number }>();
  const id = existing?.id ?? (await db.prepare("INSERT INTO people (display_name) VALUES (?1) RETURNING id").bind(name).first<{ id: number }>())!.id;
  await db.prepare("INSERT OR IGNORE INTO people_aliases (alias, person_id) VALUES (?1, ?2)").bind(name, id).run();
  return id;
}

/** `placer_status` that goes with a reporter: the uploader is the placer; no reporter means nobody to credit. */
export const placerStatusFor = (reporterId: number | null) => (reporterId === null ? "unknown" : "self");

/** Statements that make a spot's placers equal to its reporter (used when the reporter changes). */
export function syncPlacerStatements(db: D1Database, spotId: string, reporterId: number | null): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM spot_placers WHERE spot_id = ?1").bind(spotId),
    ...(reporterId === null ? [] : [db.prepare("INSERT INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(spotId, reporterId)]),
  ];
}
