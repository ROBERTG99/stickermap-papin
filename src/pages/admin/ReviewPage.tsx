import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { adminApi, filterParams, restorePatch, type AdminSpot, type SpotPatch } from "../../admin/api";
import { reasonMeta, QUEUE_REASONS } from "../../admin/reasons";
import { useShortcuts } from "../../admin/shortcuts";
import { loadAdminPeople, refreshCounts } from "../../admin/state";
import { attempt, formatAgo, placeLabel, toastError } from "../../admin/util";
import { Button } from "../../components/Button";
import { FilterChip } from "../../components/Chip";
import { ConfirmDialog, Dialog } from "../../components/Dialog";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";
import { readExif } from "../../lib/photo";
import { path, navigate } from "../../lib/router";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import { haversineMeters } from "../../shared/geo";
import { formatInt } from "../../components/StatSticker";
import { AssignPlacersDialog, PageHead, PlaceCell, ReasonBadges, SearchBox, SpotThumb, StatusBadge, useDebounced } from "./parts";
import { KeysLegend, SpotEditor } from "./SpotEditor";

/** A pin fix under this distance keeps the geocoded place name; a bigger move lets the server clear it so the cron looks it up again. */
const NEAR_M = 1000;

type Dlg = null | "delete" | "help" | "assign" | "hideBatch";

const idFromPath = (p: string): string | null => new URLSearchParams(p.split("?")[1] ?? "").get("spot");

function CheckBox({ checked, label, onToggle }: { checked: boolean | "mixed"; label: string; onToggle: () => void }) {
  return (
    <span
      class="mp-check"
      role="checkbox"
      tabIndex={0}
      aria-checked={checked}
      aria-label={label}
      style={checked === "mixed" ? { background: "var(--brand)", boxShadow: "none" } : undefined}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Icon name={checked === "mixed" ? "minus" : "check"} />
    </span>
  );
}

/** Review queue (Page10Admin 9b): the list on the left, photo + map + editor on the right, driven from the keyboard. */
export default function ReviewPage() {
  const [reason, setReason] = useState("");
  const [placerUnknown, setPlacerUnknown] = useState(false);
  const [batch, setBatch] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [rows, setRows] = useState<AdminSpot[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dlg>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [pinned, setPinned] = useState<AdminSpot | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop.value;
  const focusId = idFromPath(path.value);

  const load = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const params = filterParams({ status: "queue", placerUnknown, batch, q: dq, sort: "created_at", dir: "desc" });
      params.set("limit", "1000");
      const page = await adminApi.spots(params);
      setRows(page.rows);
      setState("ready");
    } catch (e) {
      setState("error");
      toastError(e);
    }
  }, [placerUnknown, batch, dq]);

  useEffect(() => {
    void load();
  }, [load]);

  // A spot opened from the table (`/admin?spot=ID`) is shown even when it is not in the queue.
  useEffect(() => {
    if (!focusId) {
      setPinned(null);
      return;
    }
    setSelectedId(focusId);
    setMobileDetail(true);
    void adminApi.spot(focusId).then(setPinned, toastError);
  }, [focusId]);

  const reasonCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const code of r.review_reasons) m.set(code, (m.get(code) ?? 0) + 1);
    return m;
  }, [rows]);

  const visible = useMemo(() => {
    const list = reason ? rows.filter((r) => r.review_reasons.includes(reason)) : rows;
    return pinned && !list.some((r) => r.id === pinned.id) ? [pinned, ...list] : list;
  }, [rows, reason, pinned]);

  const current = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const index = current ? visible.indexOf(current) : -1;
  /** The batch "Ocultar lote" acts on: the one being filtered, else the selected spot's. */
  const batchTarget = batch && batch !== "any" ? batch : (current?.batch_id ?? null);
  const otherReasons = [...reasonCounts.keys()].filter((c) => !(QUEUE_REASONS as readonly string[]).includes(c) && c !== "deleted");
  const chipReasons = [...QUEUE_REASONS.filter((c) => reasonCounts.has(c)), ...otherReasons];

  const replace = (spot: AdminSpot) => {
    setRows((list) => list.map((r) => (r.id === spot.id ? spot : r)));
    setPinned((p) => (p?.id === spot.id ? spot : p));
  };

  const reloadOne = async (id: string) => {
    const fresh = await attempt(() => adminApi.spot(id));
    if (fresh) replace(fresh);
  };

  const select = (id: string, openDetail = true) => {
    setSelectedId(id);
    if (openDetail) setMobileDetail(true);
  };

  const step = (delta: number) => {
    if (visible.length === 0) return;
    const next = visible[Math.min(visible.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    if (next) select(next.id, false);
  };

  /** Take a spot out of the list and move on to its neighbour. */
  const dropFromList = (ids: readonly string[]) => {
    const gone = new Set(ids);
    const at = visible.findIndex((r) => gone.has(r.id));
    const neighbour = visible.slice(at + 1).find((r) => !gone.has(r.id)) ?? [...visible.slice(0, Math.max(at, 0))].reverse().find((r) => !gone.has(r.id));
    setRows((list) => list.filter((r) => !gone.has(r.id)));
    setPinned((p) => (p && gone.has(p.id) ? null : p));
    setChecked((c) => new Set([...c].filter((id) => !gone.has(id))));
    if (focusId && gone.has(focusId)) navigate("/admin", { replace: true });
    if (neighbour) setSelectedId(neighbour.id);
    else setMobileDetail(false);
    void refreshCounts();
  };

  const undo = async (prev: AdminSpot) => {
    const ok = await attempt(() => adminApi.patchSpot(prev.id, restorePatch(prev)));
    if (!ok) return;
    await load();
    setSelectedId(prev.id);
    void refreshCounts();
    toast.show({ kind: "info", message: t("admin.toast.undone") });
  };

  const moderate = async (kind: "approve" | "hide" | "delete", spot: AdminSpot) => {
    if (busy) return;
    setBusy(true);
    const done = await attempt(() => adminApi.bulk([spot.id], kind));
    setBusy(false);
    if (!done) return;
    dropFromList([spot.id]);
    toast.show({ kind: "success", message: t(`admin.toast.${kind}`), action: { label: t("common.action.undo"), onClick: () => void undo(spot) }, durationMs: 8000 });
  };

  const patchSpot = async (spot: AdminSpot, body: SpotPatch, message?: string) => {
    const ok = await attempt(() => adminApi.patchSpot(spot.id, body));
    if (!ok) return false;
    await reloadOne(spot.id);
    if (body.placers) void loadAdminPeople();
    if (message) toast.show({ kind: "success", message });
    return true;
  };

  /** Coordinates change body: near moves carry the current place name so the API does not wipe it. */
  const moveBody = (spot: AdminSpot, lat: number, lng: number, source: SpotPatch["location_source"]): SpotPatch => ({
    lat,
    lng,
    location_source: source,
    is_approximate: spot.is_approximate, // an approximate (fuzzed) spot stays approximate: the API rounds the new coordinates
    ...(spot.place_name && haversineMeters(spot.lat, spot.lng, lat, lng) < NEAR_M ? { place_name: spot.place_name } : {}),
  });

  const moveTo = async (spot: AdminSpot, lat: number, lng: number) => {
    const near = haversineMeters(spot.lat, spot.lng, lat, lng) < NEAR_M && spot.place_name;
    const ok = await patchSpot(spot, moveBody(spot, lat, lng, "pin"));
    if (!ok) {
      await reloadOne(spot.id); // snap the marker back
      return;
    }
    toast.show({
      kind: "success",
      message: t(near ? "admin.toast.movedNear" : "admin.toast.moved"),
      action: { label: t("common.action.undo"), onClick: () => void patchSpot(spot, moveBody({ ...spot, lat, lng }, spot.lat, spot.lng, spot.location_source), t("admin.toast.undone")) },
      durationMs: 8000,
    });
  };

  const photoGps = async (spot: AdminSpot) => {
    if (gpsBusy) return;
    if (!spot.has_original) {
      toast.show({ kind: "info", message: t("admin.gps.noOriginal") });
      return;
    }
    setGpsBusy(true);
    try {
      const res = await fetch(`/api/admin/spots/${encodeURIComponent(spot.id)}/original`);
      if (!res.ok) throw new Error(String(res.status));
      const exif = await readExif(await res.blob());
      if (exif.lat === null || exif.lng === null) {
        toast.show({ kind: "info", message: t("admin.gps.none") });
        return;
      }
      const ok = await patchSpot(spot, moveBody(spot, exif.lat, exif.lng, "exif"));
      if (ok) {
        toast.show({
          kind: "success",
          message: t("admin.gps.used"),
          action: { label: t("common.action.undo"), onClick: () => void patchSpot(spot, moveBody({ ...spot, lat: exif.lat!, lng: exif.lng! }, spot.lat, spot.lng, spot.location_source), t("admin.toast.undone")) },
          durationMs: 8000,
        });
      }
    } catch {
      toast.show({ kind: "error", message: t("admin.gps.error") });
    } finally {
      setGpsBusy(false);
    }
  };

  const bulk = async (action: "approve" | "hide") => {
    const ids = [...checked];
    if (ids.length === 0 || busy) return;
    setBusy(true);
    const done = await attempt(() => adminApi.bulk(ids, action));
    setBusy(false);
    if (!done) return;
    dropFromList(ids);
    toast.show({ kind: "success", message: t(`admin.toast.bulk_${action}`, { n: ids.length }) });
  };

  const assign = async (names: string[]) => {
    const ids = [...checked];
    setBusy(true);
    const done = await attempt(() => adminApi.bulk(ids, "assign_placers", { placers: names }));
    setBusy(false);
    if (!done) return;
    setDialog(null);
    setChecked(new Set());
    toast.show({ kind: "success", message: t("admin.toast.assigned", { n: ids.length, names: names.join(", ") }) });
    await load();
    void loadAdminPeople();
    void loadBase();
    void refreshCounts();
  };

  const hideBatch = async (id: string) => {
    setDialog(null);
    const res = await attempt(() => adminApi.hideBatch(id));
    if (!res) return;
    toast.show({ kind: "success", message: t("admin.toast.batchHidden", { n: res.hidden }) });
    setBatch("");
    await load();
    void refreshCounts();
  };

  useShortcuts(
    {
      a: () => current && void moderate("approve", current),
      o: () => current && void moderate("hide", current),
      b: () => current && setDialog("delete"),
      j: () => step(1),
      k: () => step(-1),
      g: () => current && void photoGps(current),
      "/": () => searchRef.current?.focus(),
      "?": () => setDialog("help"),
    },
    dialog === null,
  );

  const allChecked = visible.length > 0 && visible.every((r) => checked.has(r.id));
  const someChecked = visible.some((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(visible.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const showList = desktop || !mobileDetail;
  const showDetail = desktop || mobileDetail;
  const filtersOn = Boolean(reason || placerUnknown || batch || dq);

  return (
    <>
      <PageHead title={t("admin.review.title")}>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => setDialog("help")}>
          <Icon name="info" size="sm" />
          {t("admin.review.shortcuts")}
        </button>
        <span class="mp-field__hint mp-admin-mode">{t("admin.review.count", { n: visible.length })}</span>
      </PageHead>

      <div class="mp-admin__body mp-review">
        {showList && (
          <section class="mp-review__list" aria-label={t("admin.review.listLabel")}>
            <SearchBox value={q} onInput={setQ} inputRef={searchRef} label={t("admin.review.search")} placeholder={t("admin.review.search")} />
            <div class="mp-chips" role="group" aria-label={t("admin.review.filters")}>
              <FilterChip label={t("admin.review.all")} count={rows.length} selected={reason === ""} onToggle={() => setReason("")} />
              {chipReasons.map((code) => (
                <FilterChip key={code} label={reasonMeta(code).label ? t(`admin.reason.${code}.chip`) : code} count={reasonCounts.get(code)} selected={reason === code} onToggle={() => setReason(reason === code ? "" : code)} />
              ))}
              <FilterChip label={t("admin.filter.placerUnknown")} selected={placerUnknown} onToggle={() => setPlacerUnknown((v) => !v)} />
              <FilterChip label={t("admin.filter.batch")} selected={batch !== ""} onToggle={() => setBatch(batch ? "" : "any")} />
            </div>

            {batch && batch !== "any" && (
              <div class="mp-banner mp-banner--countdown">
                <Icon name="layers" />
                <span>{t("admin.review.batchFilter", { n: rows.length })}</span>
                <Button size="sm" variant="secondary" icon="eye-off" class="mp-banner__action" onClick={() => setDialog("hideBatch")}>
                  {t("admin.review.hideBatch")}
                </Button>
              </div>
            )}

            {checked.size > 0 && (
              <div class="mp-bulkbar" role="status">
                <span class="mp-num">{t("admin.bulk.selected", { n: checked.size })}</span>
                <Button size="sm" variant="secondary" icon="users" onClick={() => setDialog("assign")}>
                  {t("admin.bulk.assign")}
                </Button>
                <Button size="sm" variant="secondary" icon="check" onClick={() => void bulk("approve")}>
                  {t("admin.review.approve")}
                </Button>
                <Button size="sm" variant="secondary" icon="eye-off" onClick={() => void bulk("hide")}>
                  {t("admin.review.hide")}
                </Button>
                <span style={{ flex: 1 }} />
                <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" style={{ color: "var(--bg)" }} onClick={() => setChecked(new Set())}>
                  {t("common.action.cancel")}
                </button>
              </div>
            )}

            {visible.length > 0 && (
              <div class="mp-review__selectall">
                <CheckBox checked={allChecked ? true : someChecked ? "mixed" : false} label={t("admin.bulk.selectAll")} onToggle={toggleAll} />
                <span class="mp-field__hint">{t("admin.bulk.selectAll")}</span>
              </div>
            )}

            {state === "loading" && (
              <div aria-busy="true" class="mp-review__skeletons">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={76} radius={14} />
                ))}
              </div>
            )}

            {state === "ready" && visible.length === 0 && (
              <EmptyState
                icon="/img/icons/papa.png"
                title={filtersOn ? t("admin.review.emptyFiltered") : t("admin.review.empty")}
                body={filtersOn ? t("admin.review.emptyFilteredBody") : t("admin.review.emptyBody")}
                action={filtersOn ? { label: t("common.action.clear"), onClick: () => { setReason(""); setPlacerUnknown(false); setBatch(""); setQ(""); } } : undefined}
              />
            )}

            {state === "error" && (
              <div class="mp-banner mp-banner--error" role="alert">
                <Icon name="alert" />
                <span>{t("admin.error.loadFailed")}</span>
                <Button size="sm" variant="secondary" class="mp-banner__action" onClick={() => void load()}>
                  {t("common.action.retry")}
                </Button>
              </div>
            )}

            <ul class="mp-queue">
              {visible.map((r) => (
                <li key={r.id} class={cx("mp-queue__row", current?.id === r.id && "is-current")}>
                  <CheckBox checked={checked.has(r.id)} label={t("admin.bulk.pick", { place: placeLabel(r) })} onToggle={() => toggleOne(r.id)} />
                  <button type="button" class="mp-queue__item" aria-current={current?.id === r.id ? "true" : undefined} onClick={() => select(r.id)}>
                    <SpotThumb spot={r} class="mp-queue__thumb" />
                    <span class="mp-queue__text">
                      <b>
                        <PlaceCell spot={r} />
                      </b>
                      <span class="mp-queue__badges">
                        {r.review_reasons.length > 0 ? <ReasonBadges reasons={r.review_reasons} /> : <StatusBadge spot={r} />}
                      </span>
                      <span class="mp-field__hint mp-queue__when">{formatAgo(r.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showDetail && (
          <section class="mp-review__detail">
            {!desktop && (
              <Button variant="quiet" size="sm" icon="arrow-left" onClick={() => setMobileDetail(false)}>
                {t("admin.review.back")}
              </Button>
            )}
            {current ? (
              <SpotEditor
                spot={current}
                gpsBusy={gpsBusy}
                onPatch={(body) => void patchSpot(current, body)}
                onMove={(lat, lng) => void moveTo(current, lat, lng)}
                onApprove={() => void moderate("approve", current)}
                onHide={() => void moderate("hide", current)}
                onDelete={() => setDialog("delete")}
                onGps={() => void photoGps(current)}
                onShowBatch={(id) => {
                  setBatch(id);
                  setMobileDetail(false);
                }}
                onHideBatch={() => setDialog("hideBatch")}
              />
            ) : (
              state === "ready" && desktop && <p class="mp-field__hint">{t("admin.review.pickOne")}</p>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "delete" && current !== null}
        title={t("admin.delete.title")}
        body={t("admin.delete.body")}
        confirmLabel={t("admin.delete.confirm")}
        cancelLabel={t("admin.confirm.no")}
        danger
        onConfirm={() => {
          setDialog(null);
          if (current) void moderate("delete", current);
        }}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "hideBatch" && batchTarget !== null}
        title={t("admin.batch.title")}
        body={t("admin.batch.body")}
        confirmLabel={t("admin.batch.confirm")}
        cancelLabel={t("admin.confirm.no")}
        icon="eye-off"
        onConfirm={() => batchTarget && void hideBatch(batchTarget)}
        onCancel={() => setDialog(null)}
      />
      <AssignPlacersDialog open={dialog === "assign"} count={checked.size} busy={busy} onClose={() => setDialog(null)} onAssign={(names) => void assign(names)} />
      <Dialog
        open={dialog === "help"}
        title={t("admin.keys.title")}
        art={<KeysLegend />}
        actions={
          <Button variant="primary" onClick={() => setDialog(null)}>
            {t("admin.keys.close")}
          </Button>
        }
        onClose={() => setDialog(null)}
      >
        {t("admin.keys.body")}
      </Dialog>
      <span class="mp-sr" aria-live="polite">
        {formatInt(visible.length)}
      </span>
    </>
  );
}
