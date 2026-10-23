import type { Env } from "../env";

/** `UPDATE settings` statement for the storage meter (BUILD.md §4.1); batch it with the write that caused it. */
export function meterStatement(db: D1Database, deltaBytes: number): D1PreparedStatement {
  return db.prepare("UPDATE settings SET value = CAST(MAX(0, CAST(value AS INTEGER) + ?1) AS TEXT) WHERE key = 'r2_bytes'").bind(deltaBytes);
}

export interface PutObject { key: string; body: ArrayBuffer; contentType: string }

/** Put several objects; on failure delete what was written so no orphan is left behind. */
export async function putAll(env: Env, objects: PutObject[]): Promise<void> {
  const written: string[] = [];
  try {
    for (const o of objects) {
      await env.PHOTOS.put(o.key, o.body, { httpMetadata: { contentType: o.contentType } });
      written.push(o.key);
    }
  } catch (error) {
    await env.PHOTOS.delete(written);
    throw error;
  }
}
