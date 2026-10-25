import { computed, signal } from "@preact/signals";
import { storage } from "../../lib/local";
import { isDesktop, prefersReducedMotion } from "../../lib/media";
import { placedAtMs } from "../../map/routes";
import { spots } from "../../lib/store";
import { activeFilterCount, applyFilters, EMPTY_FILTERS, facetCounts, type Filters } from "../../map/filters";

/**
 * Map page state that outlives the page (going to the gallery and back keeps your filters): the active filters and the
 * values derived from them. Everything is client side; the dataset is a few hundred points.
 */
export const filters = signal<Filters>({ ...EMPTY_FILTERS, showGone: storage.get("showGone", false) });

export const allFeatures = computed(() => spots.value?.features ?? []);
export const filteredFeatures = computed(() => applyFilters(allFeatures.value, filters.value));
export const facets = computed(() => facetCounts(allFeatures.value, filters.value));
export const activeCount = computed(() => activeFilterCount(filters.value));

export const setFilters = (next: Filters): void => {
  filters.value = next;
  storage.set("showGone", next.showGone);
};
export const clearFilters = (): void => setFilters({ ...EMPTY_FILTERS, showGone: filters.value.showGone });

/** `null` = never touched: collapsed on phones, open on desktop. */
export const legendPref = signal<boolean | null>(storage.get<boolean | null>("legendCollapsed", null));
export const setLegendCollapsed = (collapsed: boolean): void => {
  legendPref.value = collapsed;
  storage.set("legendCollapsed", collapsed);
};

// ── F5: globe, routes and time-lapse ──────────────────────────────────────

export type ProjectionChoice = "globe" | "mercator";

/** The remembered choice; otherwise the globe on desktop and on phones that can take it, flat with reduced motion or a weak device. */
function initialProjection(): ProjectionChoice {
  const saved = storage.get<ProjectionChoice | null>("projection", null);
  if (saved === "globe" || saved === "mercator") return saved;
  const weak = (navigator.hardwareConcurrency ?? 4) <= 4;
  return !prefersReducedMotion.value && (isDesktop.value || !weak) ? "globe" : "mercator";
}
export const projection = signal<ProjectionChoice>(initialProjection());
export function setProjectionChoice(next: ProjectionChoice): void {
  projection.value = next;
  storage.set("projection", next);
}

/** People whose routes are drawn (up to 4, in selection order: that order picks the colour and dash). */
export const routePeople = signal<string[]>([]);
export const MAX_ROUTES = 4;

export type TimelapseSpeed = 1 | 4 | 16;
export const timelapse = signal<{ active: boolean; playing: boolean; t: number; speed: TimelapseSpeed }>({ active: false, playing: false, t: 0, speed: 4 });

/** Oldest and newest placement among the spots that pass the filters. */
export const timelapseRange = computed(() => {
  const times = filteredFeatures.value.map(placedAtMs).filter(Number.isFinite);
  return times.length ? { min: Math.min(...times), max: Math.max(...times) } : null;
});

/** What the map draws: the filtered spots, or only those placed by the time-lapse clock. */
export const visibleFeatures = computed(() => {
  const tl = timelapse.value;
  return tl.active ? filteredFeatures.value.filter((f) => placedAtMs(f) <= tl.t) : filteredFeatures.value;
});
