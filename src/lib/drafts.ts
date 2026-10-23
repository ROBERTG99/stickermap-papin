import { signal } from "@preact/signals";

/**
 * What the map announces about unfinished bulk adds ("Tenés 3 fotos sin ubicar", "Tenés un lote sin terminar: 28 de 46
 * subidas · Seguir"). The bulk add (src/add/bulk) owns the IndexedDB draft and keeps this signal up to date; the map only reads it.
 */
export interface BulkReminder {
  /** Photos of a draft that are waiting to be placed by hand. */
  unplaced: number;
  /** An upload that did not finish. */
  unfinished: { done: number; total: number } | null;
}

export const bulkReminder = signal<BulkReminder>({ unplaced: 0, unfinished: null });
