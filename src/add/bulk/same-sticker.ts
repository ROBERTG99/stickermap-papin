import { haversineMeters } from "../../shared/geo";

/** "¿Mismo sticker?": ready photos within this distance and time of each other (BUILD.md §7.3b). */
export const SAME_METERS = 15;
export const SAME_MINUTES = 30;

export interface TimedPoint { id: string; lat: number; lng: number; takenAt: string | null }

export interface SameGroup {
  /** Photo ids in time order (at least 2). */
  ids: string[];
  /** Stable key, used to remember a dismissal. */
  key: string;
  /** Distance and time gap of the first two photos of the group, as shown in the hint. */
  meters: number;
  minutes: number;
}

/** Naive local time (`2023-08-02T10:31:01`) as ms on a UTC axis: only differences matter. */
export function naiveMs(naive: string | null): number | null {
  if (!naive) return null;
  const ms = Date.parse(`${naive}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Groups of photos that are probably several shots of one sticker: pairs within `meters` and `minutes` are chained
 * (A~B and B~C make one group). Photos without a date never group. Nothing here merges anything: the page only suggests.
 */
export function findSameGroups(items: readonly TimedPoint[], opts: { meters?: number; minutes?: number } = {}): SameGroup[] {
  const maxM = opts.meters ?? SAME_METERS;
  const maxMs = (opts.minutes ?? SAME_MINUTES) * 60_000;
  const dated = items
    .map((p) => ({ p, ms: naiveMs(p.takenAt) }))
    .filter((x): x is { p: TimedPoint; ms: number } => x.ms !== null)
    .sort((a, b) => a.ms - b.ms || a.p.id.localeCompare(b.p.id));

  const parent = dated.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) { const next = parent[i]!; parent[i] = r; i = next; }
    return r;
  };
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length && dated[j]!.ms - dated[i]!.ms <= maxMs; j++) {
      const a = dated[i]!.p;
      const b = dated[j]!.p;
      if (haversineMeters(a.lat, a.lng, b.lat, b.lng) <= maxM) parent[find(j)] = find(i);
    }
  }

  const byRoot = new Map<number, number[]>();
  dated.forEach((_, i) => {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), i]);
  });
  const groups: SameGroup[] = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) continue;
    const a = dated[members[0]!]!;
    const b = dated[members[1]!]!;
    const ids = members.map((m) => dated[m]!.p.id);
    groups.push({
      ids,
      key: [...ids].sort().join("|"),
      meters: Math.round(haversineMeters(a.p.lat, a.p.lng, b.p.lat, b.p.lng)),
      minutes: Math.round((b.ms - a.ms) / 60_000),
    });
  }
  return groups.sort((x, y) => naiveMs(findTime(items, x.ids[0]!))! - naiveMs(findTime(items, y.ids[0]!))!);
}

function findTime(items: readonly TimedPoint[], id: string): string | null {
  return items.find((p) => p.id === id)?.takenAt ?? null;
}

/** The located photo closest in time to `takenAt` (ties go to the earlier one), or null when there is no date to compare. */
export function nearestInTime<T extends TimedPoint>(takenAt: string | null, candidates: readonly T[]): T | null {
  const target = naiveMs(takenAt);
  if (target === null) return null;
  let best: T | null = null;
  let bestGap = Infinity;
  for (const c of candidates) {
    const ms = naiveMs(c.takenAt);
    if (ms === null) continue;
    const gap = Math.abs(ms - target);
    if (gap < bestGap || (gap === bestGap && best && ms < naiveMs(best.takenAt)!)) {
      best = c;
      bestGap = gap;
    }
  }
  return best;
}
