import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { adminApi, EMPTY_FILTERS, filterParams, hasActiveFilters, type AdminSpot, type BulkAction, type SpotFilters, type SpotPatch, type StatusFilter } from "../../admin/api";
import { exportSpots, type ExportFormat } from "../../admin/exports";
import { adminTypes, loadAdminPeople, refreshCounts } from "../../admin/state";
import { attempt, placeLabel, toastError } from "../../admin/util";
import { Button } from "../../components/Button";
import { FilterChip, TypeChip } from "../../components/Chip";
import { type Column, DataTable, type SortState } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { formatInt } from "../../components/StatSticker";
import { formatDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import { AssignPersonDialog, PageHead, PlaceCell, PlacerCell, SearchBox, SpotThumb, StatusBadge, TypeStickers, isTrashed, useDebounced } from "./parts";

const PAGE_SIZE = 25;
const STATUSES: readonly { value: StatusFilter; label: string }[] = [
  { value: "published", label: "admin.status.published" },
  { value: "pending", label: "admin.status.pending" },
  { value: "queue", label: "admin.status.queue" },
  { value: "hidden", label: "admin.status.hidden" },
  { value: "trash", label: "admin.status.trash" },
];

interface InlineTextProps {
  value: string | null;
  label: string;
  placeholder: string;
  maxLength: number;
  onSave: (next: string | null) => Promise<boolean>;
  children?: ComponentChildren;
}

/** A cell you edit in place: click (or Enter) to type, Enter or leaving the field saves, Esc cancels. */
function InlineText({ value, label, placeholder, maxLength, onSave, children }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const done = useRef(false);

  const commit = async () => {
    if (done.current) return;
    done.current = true;
    const next = draft.trim() || null;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
    else done.current = false;
  };

  if (!editing) {
    return (
      <button
        type="button"
        class="mp-admin-edit"
        aria-label={t("admin.table.editField", { field: label })}
        onClick={() => {
          done.current = false;
          setDraft(value ?? "");
          setEditing(true);
        }}
      >
        <span class="mp-admin-edit__text">{children ?? (value || <span class="mp-admin-muted">{placeholder}</span>)}</span>
        <Icon name="pencil" size="sm" />
      </button>
    );
  }
  return (
    <input
      class="mp-input mp-admin-inline"
      value={draft}
      maxLength={maxLength}
      disabled={saving}
      aria-label={label}
      ref={(el) => el?.focus()}
      onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          done.current = true;
          setEditing(false);
        }
      }}
    />
  );
}

/** All spots (Page11AdminData 9c): search, filters, sortable table, inline edit, bulk actions and exports that follow the filters. */
export default function DataPage() {
  const [filters, setFilters] = useState<SpotFilters>({ ...EMPTY_FILTERS });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminSpot[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "assign" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [progress, setProgress] = useState("");
  const request = useRef(0);
  const effective: SpotFilters = { ...filters, q: dq };

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const params = filterParams({ ...filters, q: dq });
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    try {
      const res = await adminApi.spots(params);
      if (id !== request.current) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      if (id === request.current) toastError(e);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [filters, dq, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = (patch: Partial<SpotFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  useEffect(() => setPage(1), [dq]);

  const sort: SortState = { key: filters.sort, dir: filters.dir };

  const saveField = async (spot: AdminSpot, body: SpotPatch): Promise<boolean> => {
    const ok = await attempt(() => adminApi.patchSpot(spot.id, body));
    if (!ok) return false;
    const fresh = await attempt(() => adminApi.spot(spot.id));
    if (fresh) setRows((list) => list.map((r) => (r.id === fresh.id ? fresh : r)));
    if (body.reporter !== undefined) void loadAdminPeople();
    toast.show({ kind: "success", message: t("admin.toast.saved") });
    return true;
  };

  const runBulk = async (action: BulkAction, message: string, extra: { person?: string } = {}) => {
    const ids = [...selected];
    if (ids.length === 0 || busy) return;
    setBusy(true);
    const done = await attempt(() => adminApi.bulk(ids, action, extra));
    setBusy(false);
    if (!done) return;
    setSelected(new Set());
    setDialog(null);
    toast.show({ kind: "success", message });
    await load();
    void refreshCounts();
    if (action === "assign_person") {
      void loadAdminPeople();
      void loadBase();
    }
  };

  const doExport = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    setProgress("");
    try {
      const out = await exportSpots(format, effective, (loaded, all) => setProgress(`${formatInt(loaded)}/${formatInt(all)}`));
      toast.show({ kind: "success", message: out.rows === null ? t("admin.export.done", { file: out.filename }) : t("admin.export.doneRows", { file: out.filename, n: formatInt(out.rows) }) });
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(null);
    }
  };

  const columns: Column<AdminSpot>[] = [
    { key: "photo", header: t("admin.table.photo"), cell: (r) => <SpotThumb spot={r} /> },
    { key: "types", header: t("admin.table.types"), cell: (r) => <TypeStickers slugs={r.types} /> },
    { key: "placers", header: t("admin.table.placers"), cell: (r) => <PlacerCell spot={r} /> },
    {
      key: "reporter",
      header: t("admin.table.reporter"),
      sortable: true,
      cell: (r) => (
        <InlineText value={r.reporter} label={t("admin.table.reporter")} placeholder={t("common.person.anonymous")} maxLength={255} onSave={(v) => saveField(r, { reporter: v })} />
      ),
    },
    {
      key: "place",
      header: t("admin.table.place"),
      sortable: true,
      cell: (r) => (
        <InlineText value={r.place_name} label={t("admin.table.place")} placeholder={placeLabel(r)} maxLength={200} onSave={(v) => saveField(r, { place_name: v })}>
          <PlaceCell spot={r} />
        </InlineText>
      ),
    },
    {
      key: "note",
      header: t("admin.table.note"),
      cell: (r) => <InlineText value={r.note} label={t("admin.table.note")} placeholder={t("admin.table.noNote")} maxLength={280} onSave={(v) => saveField(r, { note: v })} />,
    },
    { key: "created_at", header: t("admin.table.date"), sortable: true, firstDir: "desc", numeric: true, cell: (r) => formatDate(r.created_at) },
    { key: "status", header: t("admin.table.status"), sortable: true, cell: (r) => <StatusBadge spot={r} /> },
    {
      key: "open",
      header: "",
      cell: (r) => (
        <a class="mp-btn mp-btn--quiet mp-btn--sm" href={`/admin?spot=${encodeURIComponent(r.id)}`} aria-label={t("admin.table.open", { place: placeLabel(r) })}>
          <Icon name="expand" size="sm" />
          {t("admin.table.openShort")}
        </a>
      ),
    },
  ];

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const inTrash = filters.status === "trash" || (selectedRows.length > 0 && selectedRows.every(isTrashed));

  const toolbar = (
    <div class="mp-admin-tools">
      <div class="mp-admin-tools__row">
        <SearchBox value={q} onInput={setQ} label={t("admin.table.search")} placeholder={t("admin.table.search")} />
        <div class="mp-chips" role="group" aria-label={t("admin.table.statusFilter")}>
          <FilterChip label={t("admin.status.all")} selected={filters.status === ""} onToggle={() => change({ status: "" })} />
          {STATUSES.map((s) => (
            <FilterChip key={s.value} label={t(s.label)} selected={filters.status === s.value} onToggle={() => change({ status: filters.status === s.value ? "" : s.value })} />
          ))}
        </div>
      </div>
      <div class="mp-chips" role="group" aria-label={t("admin.table.moreFilters")}>
        <FilterChip label={t("admin.filter.anonymous")} selected={filters.anonymous} onToggle={() => change({ anonymous: !filters.anonymous })} />
        <FilterChip label={t("admin.filter.noPhoto")} selected={filters.reason === "legacy_other_no_data"} onToggle={() => change({ reason: filters.reason ? "" : "legacy_other_no_data" })} />
        <FilterChip label={t("admin.filter.batch")} selected={filters.batch !== ""} onToggle={() => change({ batch: filters.batch ? "" : "any" })} />
        {adminTypes.value
          .filter((x) => x.is_active)
          .map((x, i) => (
            <TypeChip key={x.slug} type={x} index={i} selected={filters.type === x.slug} onToggle={(slug) => change({ type: filters.type === slug ? "" : slug })} />
          ))}
        {hasActiveFilters(effective) && (
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => { setQ(""); change({ ...EMPTY_FILTERS, sort: filters.sort, dir: filters.dir }); }}>
            {t("common.action.clear")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHead title={t("admin.data.title")}>
        <span class="mp-field__hint mp-admin-count" aria-live="polite">
          {t("admin.data.count", { n: formatInt(total) })}
        </span>
        <span class="mp-export" role="group" aria-label={t("admin.export.label")}>
          {(["csv", "geojson", "gpkg"] as const).map((format) => (
            <Button key={format} size="sm" variant="secondary" icon="download" loading={exporting === format} disabled={exporting !== null && exporting !== format} onClick={() => void doExport(format)}>
              {exporting === format ? (progress ? t("admin.export.building", { progress }) : t("admin.export.preparing")) : t(`admin.export.${format}`)}
            </Button>
          ))}
        </span>
      </PageHead>

      <div class="mp-admin__body mp-admin-pad">
        <p class="mp-field__hint mp-admin-exporthint">{t("admin.export.hint")}</p>
        <DataTable<AdminSpot>
          label={t("admin.data.title")}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowLabel={(r) => placeLabel(r)}
          loading={loading}
          empty={<EmptyState icon="/img/icons/papa.png" title={t("common.empty.filter")} />}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          sort={sort}
          onSortChange={(s) => change({ sort: s.key, dir: s.dir })}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          bulkActions={
            <>
              <Button size="sm" variant="secondary" icon="users" onClick={() => setDialog("assign")}>
                {t("admin.bulk.assign")}
              </Button>
              {inTrash ? (
                <Button size="sm" variant="secondary" icon="rotate" onClick={() => void runBulk("restore", t("admin.toast.bulk_restore", { n: selected.size }))}>
                  {t("admin.bulk.restore")}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" icon="check" onClick={() => void runBulk("approve", t("admin.toast.bulk_approve", { n: selected.size }))}>
                    {t("admin.review.approve")}
                  </Button>
                  <Button size="sm" variant="secondary" icon="eye-off" onClick={() => void runBulk("hide", t("admin.toast.bulk_hide", { n: selected.size }))}>
                    {t("admin.review.hide")}
                  </Button>
                  <Button size="sm" variant="secondary" icon="trash" onClick={() => setDialog("delete")}>
                    {t("admin.review.delete")}
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      <AssignPersonDialog
        open={dialog === "assign"}
        count={selected.size}
        busy={busy}
        onClose={() => setDialog(null)}
        onAssign={(name) => void runBulk("assign_person", t("admin.toast.assigned", { n: selected.size, names: name }), { person: name })}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("admin.delete.titleMany", { n: selected.size })}
        body={t("admin.delete.body")}
        confirmLabel={t("admin.delete.confirm")}
        cancelLabel={t("admin.confirm.no")}
        danger
        onConfirm={() => void runBulk("delete", t("admin.toast.bulk_delete", { n: selected.size }))}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
