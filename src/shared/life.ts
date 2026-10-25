/** F4 "¿Sigue vivo?": the life of a sticker, derived from the sightings people report (BUILD.md §19). Pure, so it is unit tested. */

export type SightingStatus = "alive" | "damaged" | "covered" | "removed" | "moved";
export type SightingReview = "auto" | "pending" | "approved" | "rejected";
export type LifeStatus = "alive" | "unknown" | "dead";

export interface SightingLite {
  status: SightingStatus;
  /** ISO timestamp. */
  created_at: string;
  review: SightingReview;
}

export interface Life {
  status: LifeStatus;
  /** Last time a counted sighting found it standing (alive or damaged). */
  lastSeenAt: string | null;
  /** When the sighting that counted it as gone was made. */
  diedAt: string | null;
  /** Sightings that are not rejected (what the badge says: "4 avistajes"). */
  count: number;
}

const DAY_MS = 86_400_000;
/** No news for this long and a living sticker becomes "sin noticias". */
export const STALE_DAYS = 365;

const standing = (s: SightingStatus): boolean => s === "alive" || s === "damaged" || s === "moved";
export const isGoneStatus = (s: SightingStatus): boolean => s === "covered" || s === "removed";

const ms = (iso: string): number => Date.parse(iso);

/**
 * A sighting changes the life status when it is verified (`auto`) or approved by an admin, or when a second, independent
 * sighting says the same thing (standing vs gone). Rejected ones never count; pending ones wait.
 */
export function countedSightings(all: readonly SightingLite[]): SightingLite[] {
  const live = all.filter((s) => s.review !== "rejected");
  return live.filter((s) => {
    if (s.review === "auto" || s.review === "approved") return true;
    return live.some((o) => o !== s && standing(o.status) === standing(s.status));
  });
}

/**
 * - the last counted sighting decides: gone -> dead, standing -> alive;
 * - alive with no news for 12 months -> unknown; with no sighting at all, a spot is alive for its first 12 months, then unknown.
 */
export function computeLife(placedAt: string, sightings: readonly SightingLite[], now: number = Date.now()): Life {
  const live = sightings.filter((s) => s.review !== "rejected");
  const counted = countedSightings(sightings).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const last = counted.at(-1);
  const seen = counted.filter((s) => standing(s.status) && s.status !== "moved").at(-1);
  const lastSeenAt = seen?.created_at ?? null;
  if (last && isGoneStatus(last.status)) return { status: "dead", lastSeenAt, diedAt: last.created_at, count: live.length };
  const since = ms(lastSeenAt ?? placedAt);
  const stale = Number.isFinite(since) && now - since > STALE_DAYS * DAY_MS;
  return { status: stale ? "unknown" : "alive", lastSeenAt, diedAt: null, count: live.length };
}

/** How long it lasted: (died, else last seen, else now) minus the day it was stuck, in whole days. */
export function survivalDays(placedAt: string, life: Pick<Life, "diedAt" | "lastSeenAt">, now: number = Date.now()): number {
  const end = life.diedAt ? ms(life.diedAt) : life.lastSeenAt ? ms(life.lastSeenAt) : now;
  return Math.max(0, Math.floor((end - ms(placedAt)) / DAY_MS));
}

/** Age of a living sticker today (what "the oldest living" ranks by). */
export const ageDays = (placedAt: string, now: number = Date.now()): number => Math.max(0, Math.floor((now - ms(placedAt)) / DAY_MS));

/** `taken_at` is naive local time without a zone: read it as UTC, a day of error is fine for ages. */
export const placedAtOf = (takenAt: string | null, createdAt: string): string => (takenAt ? `${takenAt}${takenAt.endsWith("Z") ? "" : "Z"}` : createdAt);

/** Verified means standing within this distance of the spot (BUILD.md §19 F4). */
export const VERIFY_RADIUS_M = 300;
/** "Estás cerca": the radar nudges you to check on a sticker this close. */
export const NEAR_RADIUS_M = 150;
/** A photo counts as fresh when it was taken this recently. */
export const FRESH_PHOTO_MS = 3 * DAY_MS;
