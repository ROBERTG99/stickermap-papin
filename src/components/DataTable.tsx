import type { ComponentChildren } from "preact";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";
import { formatInt } from "./StatSticker";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<T> {
  /** Stable id; also the sort key reported to `onSortChange`. */
  key: string;
  /** Header text. */
  header: string;
  /** Cell content for a row. */
  cell: (row: T, index: number) => ComponentChildren;
  /** Header becomes a button that reports `onSortChange`. */
  sortable?: boolean;
  /** Direction applied the first time this column is sorted (default "asc"). */
  firstDir?: SortDir;
  /** Tabular figures (dates, counts). */
  numeric?: boolean;
}

export interface Shortcut {
  keys: readonly string[];
  label: string;
}

export interface DataTableProps<T> {
  /** Accessible table name (visually hidden caption). */
  label: string;
  columns: readonly Column<T>[];
  /** Rows of the current page. Sorting and paging are controlled by the parent (server-side friendly). */
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Spoken name of a row, used by its checkbox: "Elegir <name>". */
  rowLabel?: (row: T) => string;
  loading?: boolean;
  /** Shown when there are no rows. */
  empty?: ComponentChildren;
  /** Max height in px of the scroll area; the header stays sticky inside it. */
  maxHeight?: number;

  /** Show the selection column. */
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /** Buttons of the bulk bar (visible while 1+ rows are selected). */
  bulkActions?: ComponentChildren;

  sort?: SortState | null;
  onSortChange?: (next: SortState) => void;

  /** Search, quick filters and export, above the table. */
  toolbar?: ComponentChildren;

  /** 1-based current page. Omit `total` to hide the pager. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;

  /** Keyboard shortcuts legend (always visible, never only a tooltip). */
  shortcuts?: readonly Shortcut[];
  class?: string;
}

type CheckState = "true" | "false" | "mixed";

interface CheckProps {
  state: CheckState;
  label: string;
  onToggle: () => void;
}

function Check({ state, label, onToggle }: CheckProps) {
  return (
    <span
      class="mp-check"
      role="checkbox"
      tabIndex={0}
      aria-checked={state}
      aria-label={label}
      style={state === "mixed" ? { background: "var(--brand)", boxShadow: "none" } : undefined}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Icon name={state === "mixed" ? "minus" : "check"} />
    </span>
  );
}

/** Page numbers with ellipses: 1 … 4 5 6 … 12. */
function pageItems(page: number, count: number): (number | "gap")[] {
  const wanted = new Set<number>([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((n) => wanted.add(n));
  const sorted = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) items.push("gap");
    items.push(n);
  });
  return items;
}

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange?: (page: number) => void;
}

function Pager({ page, pageSize, total, onPageChange }: PagerProps) {
  const count = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
      <span class="mp-pager mp-num" aria-live="polite">
        {formatInt(from)}–{formatInt(to)} de {formatInt(total)}
      </span>
      {count > 1 && (
        <nav class="mp-pager" aria-label="Páginas">
          <button type="button" class="mp-pager__page" aria-label="Anterior" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
            <Icon name="chevron-left" size="sm" />
          </button>
          {pageItems(page, count).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                class="mp-pager__page"
                aria-current={item === page ? "page" : undefined}
                aria-label={`Página ${item}`}
                onClick={() => onPageChange?.(item)}
              >
                {item}
              </button>
            ),
          )}
          <button type="button" class="mp-pager__page" aria-label="Siguiente" disabled={page >= count} onClick={() => onPageChange?.(page + 1)}>
            <Icon name="chevron-right" size="sm" />
          </button>
        </nav>
      )}
    </div>
  );
}

const SORT_BUTTON_STYLE = {
  appearance: "none",
  border: 0,
  background: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-1)",
} as const;

const SKELETON_ROWS = 5;

/** Admin table: sortable headers, row selection, sticky header, bulk bar, pager and shortcut legend. */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowLabel,
  loading,
  empty,
  maxHeight,
  selectable,
  selected,
  onSelectionChange,
  bulkActions,
  sort,
  onSortChange,
  toolbar,
  page = 1,
  pageSize = 25,
  total,
  onPageChange,
  shortcuts,
  class: className,
}: DataTableProps<T>) {
  const picked = selected ?? new Set<string>();
  const pageKeys = rows.map(rowKey);
  const pickedOnPage = pageKeys.filter((k) => picked.has(k)).length;
  const headState: CheckState = pickedOnPage === 0 ? "false" : pickedOnPage === pageKeys.length ? "true" : "mixed";

  const emit = (next: Set<string>) => onSelectionChange?.(next);
  const toggleRow = (key: string) => {
    const next = new Set(picked);
    if (!next.delete(key)) next.add(key);
    emit(next);
  };
  const toggleAll = () => {
    const next = new Set(picked);
    if (headState === "true") pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    emit(next);
  };
  const cycleSort = (col: Column<T>) => {
    const dir: SortDir = sort?.key === col.key ? (sort.dir === "asc" ? "desc" : "asc") : (col.firstDir ?? "asc");
    onSortChange?.({ key: col.key, dir });
  };

  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div class={className} style={{ display: "grid", gap: "var(--space-3)" }}>
      {toolbar}

      {selectable && picked.size > 0 && (
        <div class="mp-bulkbar" role="status">
          <span class="mp-num">{formatInt(picked.size)} {picked.size === 1 ? "elegido" : "elegidos"}</span>
          {bulkActions}
          <span style={{ flex: 1 }} />
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" style={{ color: "var(--bg)" }} onClick={() => emit(new Set())}>
            Cancelar
          </button>
        </div>
      )}

      <div
        style={{
          borderRadius: "var(--radius-md)",
          overflow: "auto",
          maxHeight: maxHeight ? `${maxHeight}px` : undefined,
          boxShadow: "0 0 0 1px var(--line)",
        }}
      >
        <table class="mp-table" aria-busy={loading ? "true" : undefined}>
          <caption class="mp-sr">{label}</caption>
          <thead>
            <tr>
              {selectable && (
                <th scope="col">
                  <Check state={headState} label="Elegir todos" onToggle={toggleAll} />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.key === col.key ? sort : null;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={col.sortable ? (active ? (active.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  >
                    {col.sortable ? (
                      <button type="button" style={SORT_BUTTON_STYLE} onClick={() => cycleSort(col)}>
                        {col.header}
                        {active && <Icon name={active.dir === "asc" ? "chevron-up" : "chevron-down"} />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, r) => (
                  <tr key={`skeleton-${r}`}>
                    {Array.from({ length: colCount }, (_, c) => (
                      <td key={c}>
                        <Skeleton variant="line" width={c === 0 && selectable ? 22 : "70%"} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, i) => {
                  const key = rowKey(row);
                  const isPicked = picked.has(key);
                  return (
                    <tr key={key} aria-selected={selectable ? (isPicked ? "true" : "false") : undefined}>
                      {selectable && (
                        <td>
                          <Check state={isPicked ? "true" : "false"} label={`Elegir ${rowLabel ? rowLabel(row) : key}`} onToggle={() => toggleRow(key)} />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} class={cx(col.numeric && "mp-num")}>
                          {col.cell(row, i)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total !== undefined && <Pager page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />}

      {shortcuts && shortcuts.length > 0 && (
        <div class="mp-keys">
          {shortcuts.map((s) => (
            <span key={s.label}>
              {s.keys.map((k) => (
                <kbd key={k} class="mp-kbd">
                  {k}
                </kbd>
              ))}
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
