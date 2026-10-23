import { useState } from "preact/hooks";
import { ConfirmDialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/cx";
import { formatRemaining } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import { effectiveCoords } from "./classify";
import { counts, deleteLastBatch, draft, lastBatchGrant, photos, resetToChoose, reviewLeftovers } from "./bulk";
import { BatchMap, type MapPoint } from "./map";
import { plural } from "./ui";

/** Step 5: "¡Mandaste mecha!", a map fitted to the new stickers, and the 24 h window to edit or delete the batch. */
export function DoneView() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const d = draft.value;
  const send = d?.sendNo;
  const mine = photos.value.filter((p) => p.upload.send === send);
  const created = mine.filter((p) => p.upload.state === "done");
  const already = mine.filter((p) => p.upload.state === "exists").length;
  const count = d?.lastSend?.count ?? created.length;
  const unplaced = counts.value.noloc;
  const grant = lastBatchGrant();
  const points: MapPoint[] = created.flatMap((p) => {
    const { lat, lng } = effectiveCoords(p);
    return lat === null || lng === null ? [] : [{ id: p.id, lat, lng, typeSlug: (p.override.types ?? d?.defaults.types ?? [])[0] ?? null }];
  });

  const remove = async () => {
    setDeleting(true);
    const ok = await deleteLastBatch();
    setDeleting(false);
    setConfirming(false);
    if (ok) toast.show({ kind: "success", message: t("bulk.done.deleted") });
    else toast.show({ kind: "error", message: t("bulk.done.deleteFailed"), action: { label: t("bulk.retry"), onClick: () => void remove() } });
  };

  return (
    <div class="bulk-done">
      <div class="bulk-done__map">
        <BatchMap points={points} fitKey={points.length} label={t("bulk.map.aria")} />
        {count > 0 && (
          <div class={cx("mp-stat mp-stat--brand bulk-done__stat")} role="status">
            <span class="mp-stat__num">{count}</span>
            <span class="mp-stat__label">{plural(count, "bulk.done.newOne", "bulk.done.new")}</span>
          </div>
        )}
      </div>
      <div class="bulk-done__body" style={count === 0 ? { paddingTop: "var(--space-8)" } : undefined}>
        <div class="bulk__stack">
          <h1>{count > 0 ? t("bulk.thanksTitle") : t("bulk.done.nothing")}</h1>
          <p>{count > 0 ? t("bulk.thanksLine") : t("bulk.done.nothingBody")}</p>
          {already > 0 && <p class="bulk__tip">{plural(already, "bulk.done.alreadyOne", "bulk.done.already")}</p>}
        </div>

        {unplaced > 0 && (
          <div class="mp-banner mp-banner--resume" role="status">
            <Icon name="pin" />
            <span>{plural(unplaced, "bulk.done.unplacedOne", "bulk.done.unplaced")}</span>
            <button type="button" class="mp-btn mp-btn--primary mp-btn--sm mp-banner__action" onClick={reviewLeftovers}>
              {plural(unplaced, "bulk.done.locateOne", "bulk.done.locate")}
            </button>
          </div>
        )}

        <div class="bulk-done__actions">
          <a class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" href="/">{t("bulk.done.view")}</a>
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--block" onClick={resetToChoose}>{t("bulk.done.more")}</button>
        </div>

        {grant && count > 0 && (
          <div class="bulk-done__owner">
            <span><Icon name="clock" size="sm" /> {t("bulk.done.edit", { time: formatRemaining(grant.remainingMs) })}</span>
            <button type="button" class="mp-btn mp-btn--danger-ghost mp-btn--sm" onClick={() => setConfirming(true)}>
              <Icon name="trash" size="sm" />
              {t("bulk.done.delete")}
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        danger
        title={t("bulk.done.deleteTitle")}
        body={t("bulk.done.deleteBody", { n: count })}
        confirmLabel={deleting ? t("bulk.done.deleting") : t("bulk.done.delete")}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
