import { computed, signal } from "@preact/signals";
import { storage } from "../../lib/local";
import { spots } from "../../lib/store";
import { activeFilterCount, applyFilters, EMPTY_FILTERS, facetCounts, type Filters } from "../../map/filters";

/**
 * Map page state that outlives the page (going to the gallery and back keeps your filters): the active filters and the
 * values derived from them. Everything is client side; the dataset is a few hundred points.
 */
export const filters = signal<Filters>(EMPTY_FILTERS);

export const allFeatures = computed(() => spots.value?.features ?? []);
export const filteredFeatures = computed(() => applyFilters(allFeatures.value, filters.value));
export const facets = computed(() => facetCounts(allFeatures.value, filters.value));
export const activeCount = computed(() => activeFilterCount(filters.value));

export const setFilters = (next: Filters): void => {
  filters.value = next;
};
export const clearFilters = (): void => setFilters(EMPTY_FILTERS);

/** `null` = never touched: collapsed on phones, open on desktop. */
export const legendPref = signal<boolean | null>(storage.get<boolean | null>("legendCollapsed", null));
export const setLegendCollapsed = (collapsed: boolean): void => {
  legendPref.value = collapsed;
  storage.set("legendCollapsed", collapsed);
};
