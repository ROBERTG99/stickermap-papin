import { useEffect, useState } from "preact/hooks";
import { adminApi, type AdminSighting } from "../../admin/api";
import { refreshCounts } from "../../admin/state";
import { toastError } from "../../admin/util";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Flag } from "../../components/Flag";
import { Segmented } from "../../components/Segmented";
import { Skeleton } from "../../components/Skeleton";
import { formatDate, formatKm } from "../../lib/format";
import { lang, t } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import { PageHead } from "./parts";

type Filter = "pending" | "all";

/** Avistajes (F4): the check-ins nobody could verify. Approving or rejecting recomputes the life of the spot. */
export default function SightingsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<AdminSighting[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (f: Filter = filter) => {
    try {
      setRows((await adminApi.sightings(f)).rows);
    } catch (e) {
      toastError(e);
      setRows([]);
    }
  };
  useEffect(() => { setRows(null); void load(filter); }, [filter]);

  const decide = async (row: AdminSighting, decision: "approve" | "reject") => {
    setBusy(row.id);
    try {
      await adminApi.reviewSighting(row.id, decision);
      toast.show({ kind: "success", message: t(decision === "approve" ? "admin.sightings.approved" : "admin.sightings.rejected") });
      await load();
      void refreshCounts();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title={t("admin.sightings.title")} />
      <div class="mp-admin__body mp-admin-pad">
        <p class="mp-field__hint">{t("admin.sightings.intro")}</p>
        <Segmented<Filter>
          ariaLabel={t("admin.sightings.title")}
          value={filter}
          onChange={setFilter}
          options={[{ value: "pending", label: t("admin.sightings.filterPending") }, { value: "all", label: t("admin.sightings.filterAll") }]}
        />
        {rows === null ? (
          <Skeleton height={160} radius={16} />
        ) : rows.length === 0 ? (
          <EmptyState icon="eye" title={t("admin.sightings.empty")} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
            {rows.map((r) => (
              <li key={r.id} class="mp-card" style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "var(--space-3)", alignItems: "start" }}>
                <div class="mp-photo" style={{ "--ratio": 1, width: 72 }}>{(r.thumb ?? r.spot_thumb) && <img src={r.thumb ?? r.spot_thumb ?? ""} alt="" loading="lazy" />}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  <b>{t(`components.life.status.${r.status}`)}</b>
                  <span class="mp-field__hint" style={{ margin: 0 }}>
                    {r.country_code && <Flag code={r.country_code} />} {r.place_name ?? r.spot_id} · {r.reporter ?? t("components.life.anonymous")} · {formatDate(r.created_at, lang.value)}
                  </span>
                  <span class="mp-field__hint" style={{ margin: 0 }}>
                    {t(`admin.sightings.state.${r.review}`)} · {r.distance_m === null ? t("admin.sightings.noLocation") : t("admin.sightings.far", { dist: r.distance_m < 1000 ? `${Math.round(r.distance_m)} m` : formatKm(r.distance_m) })}
                  </span>
                  {r.note && <span>{r.note}</span>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {r.review !== "approved" && <Button size="sm" variant="primary" icon="check" loading={busy === r.id} onClick={() => void decide(r, "approve")}>{t("admin.sightings.approve")}</Button>}
                    {r.review !== "rejected" && <Button size="sm" variant="secondary" icon="x" disabled={busy === r.id} onClick={() => void decide(r, "reject")}>{t("admin.sightings.reject")}</Button>}
                    <a class="mp-btn mp-btn--quiet mp-btn--sm" href={`/s/${r.spot_id}`} target="_blank" rel="noopener noreferrer">{t("admin.sightings.spot")}</a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
