import { BatchItem, BatchList, type BatchRow } from "../../components/BatchItem";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { busy, runUpload, sendRows, uploadRunning, uploadStats } from "./bulk";
import { clockOf } from "./effective";
import { UploadBar } from "./Submit";
import { Thumb, whereLabel } from "./ui";
import type { PhotoMeta } from "./types";

function toUploadRow(p: PhotoMeta): BatchRow {
  const pct = busy.value.get(p.id);
  const state = p.upload.state;
  const done = state === "done" || state === "exists";
  return {
    kind: "upload",
    place: state === "exists" ? t("bulk.upload.exists") : whereLabel(p),
    time: clockOf(p.takenAt),
    state: done ? "done" : state === "failed" ? "failed" : pct !== undefined ? "busy" : "queued",
    progress: pct,
    detail: state === "failed" ? t(`bulk.upload.error.${p.upload.error ?? "error"}`) : undefined,
  };
}

/** Step 4: one bar for the batch and a state per photo. Failed photos retry on their own, then wait for "Reintentar fallidas". */
export function UploadView() {
  const stats = uploadStats.value;
  const running = uploadRunning.value;
  return (
    <>
      <div class="bulk__main">
        <div class="mp-banner mp-banner--info" role="status"><Icon name="info" />{t("bulk.upload.keepOpen")}</div>
        {!running && stats.failed > 0 && <div class="mp-banner mp-banner--error" role="alert"><Icon name="wifi-off" />{t("bulk.network")}</div>}
        <BatchList label={t("bulk.upload.aria")}>
          {sendRows.value.map((p, i) => (
            <BatchItem key={p.id} row={toUploadRow(p)} index={i} number={i + 1} thumb={<Thumb id={p.id} />} />
          ))}
        </BatchList>
      </div>
      <UploadBar done={stats.done} total={stats.total} failed={stats.failed} running={running} onRetry={() => void runUpload()} />
    </>
  );
}
