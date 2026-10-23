import { BatchItem, BatchList } from "../../components/BatchItem";
import { ProgressBar } from "../../components/ProgressBar";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";
import { photos, readProgress, rows } from "./bulk";
import { Thumb, toBatchRow } from "./ui";

/** Reading photos on the device: nothing is uploaded yet. The last few results show as they come in. */
export function ReadingView() {
  const { done, total } = readProgress.value;
  const pct = total === 0 ? 0 : (done / total) * 100;
  const recent = rows.value.slice().sort((a, b) => b.photo.seq - a.photo.seq).slice(0, 5);
  return (
    <div class="bulk__main">
      <div class="bulk-reading">
        <ProgressBar value={pct} label={t("bulk.reading.label", { done, total })} />
        <p class="bulk__lead">{isDesktop.value ? t("bulk.reading.noteDesktop") : t("bulk.reading.note")}</p>
      </div>
      {photos.value.length > 0 && (
        <BatchList label={t("bulk.reading.listAria")}>
          {recent.map((row) => (
            <BatchItem key={row.photo.id} row={toBatchRow(row)} index={row.photo.seq} number={row.photo.seq + 1} thumb={<Thumb id={row.photo.id} />} />
          ))}
        </BatchList>
      )}
    </div>
  );
}
