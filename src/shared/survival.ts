/** F4 longevity statistics: survival curves (Kaplan-Meier) and group averages. Pure, so they are unit tested. */

export interface Lifetime {
  /** Days the sticker lasted (dead) or has lasted so far (still standing: censored). */
  days: number;
  dead: boolean;
}

export interface CurvePoint { day: number; alive: number }

/**
 * Share of stickers still standing `day` days after being stuck, every `step` days up to `maxDays`.
 * Still-standing ones count as "alive so far" only until their own age (Kaplan-Meier), so young stickers do not look immortal.
 */
export function survivalCurve(items: readonly Lifetime[], step = 30, maxDays = 720): CurvePoint[] {
  const points: CurvePoint[] = [{ day: 0, alive: 1 }];
  let s = 1;
  const deaths = [...items].filter((i) => i.dead).sort((a, b) => a.days - b.days);
  for (let day = step; day <= maxDays; day += step) {
    // everything observed at least up to `day - step` is at risk when a death happens inside (day - step, day]
    for (const d of deaths.filter((x) => x.days > day - step && x.days <= day)) {
      const atRisk = items.filter((i) => i.days >= d.days).length;
      if (atRisk > 0) s *= 1 - 1 / atRisk;
    }
    if (!items.some((i) => i.days >= day)) break; // nobody has been observed this long
    points.push({ day, alive: Math.round(s * 1000) / 1000 });
  }
  return points;
}

export interface Group { key: string; label: string; days: number }

/** Mean days per group, groups of at least `min` stickers, biggest mean first. */
export function averageBy(items: readonly Group[], min = 1): { key: string; label: string; avg_days: number; count: number }[] {
  const by = new Map<string, { label: string; sum: number; n: number }>();
  for (const i of items) {
    const g = by.get(i.key) ?? { label: i.label, sum: 0, n: 0 };
    g.sum += i.days;
    g.n++;
    by.set(i.key, g);
  }
  return [...by.entries()]
    .filter(([, g]) => g.n >= min)
    .map(([key, g]) => ({ key, label: g.label, avg_days: Math.round(g.sum / g.n), count: g.n }))
    .sort((a, b) => b.avg_days - a.avg_days || a.label.localeCompare(b.label));
}
