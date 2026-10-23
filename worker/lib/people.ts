/**
 * People are shared by both roles (reporter "Soy:" and placer "¿Quién lo pegó?"). Names are matched
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

/** Resolve several names to distinct person ids, keeping order. */
export async function findOrCreatePeople(db: D1Database, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const n of names) {
    const id = await findOrCreatePerson(db, n);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
