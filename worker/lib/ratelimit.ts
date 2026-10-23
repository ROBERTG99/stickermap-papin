import { hmacHex } from "./crypto";

export type LimitKind = "single" | "batch" | "batch_spot";

/** Per-IP limits (BUILD.md §8): [window ms, max] pairs per kind. */
export const LIMITS: Record<LimitKind, [number, number][]> = {
  single: [[3_600_000, 10], [86_400_000, 50]],
  batch: [[86_400_000, 3]],
  batch_spot: [[86_400_000, 200]],
};

export const ipHash = (secret: string, ip: string | null) => hmacHex(secret, ip ?? "unknown");

/** True when `ipHashValue` may do one more `kind` action right now. Does not record it. */
export async function allowed(db: D1Database, ipHashValue: string, kind: LimitKind, now = Date.now()): Promise<boolean> {
  const rules = LIMITS[kind];
  const counts = await db.batch(
    rules.map(([window]) => db.prepare("SELECT COUNT(*) AS n FROM submissions_rl WHERE ip_hash = ?1 AND kind = ?2 AND at > ?3").bind(ipHashValue, kind, now - window)),
  );
  return rules.every(([, max], i) => ((counts[i]?.results[0] as { n: number } | undefined)?.n ?? 0) < max);
}

/** Record one action and purge rows older than 2 days (BUILD.md §8). */
export async function record(db: D1Database, ipHashValue: string, kind: LimitKind, now = Date.now()): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO submissions_rl (ip_hash, at, kind) VALUES (?1, ?2, ?3)").bind(ipHashValue, now, kind),
    db.prepare("DELETE FROM submissions_rl WHERE at < ?1").bind(now - 2 * 86_400_000),
  ]);
}
