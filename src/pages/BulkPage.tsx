import { useEffect, useState } from "preact/hooks";
import "../add/bulk/bulk.css";
import { ChooseView } from "../add/bulk/Choose";
import { DoneView } from "../add/bulk/Done";
import { ReadingView } from "../add/bulk/Reading";
import { ReviewView } from "../add/bulk/Review";
import { PhotoSheet } from "../add/bulk/Sheets";
import { UploadView } from "../add/bulk/UploadView";
import { counts, init, phase, resetToChoose } from "../add/bulk/bulk";
import { AppHeader } from "../components/AppHeader";
import { Icon } from "../components/Icon";
import { t } from "../lib/i18n";
import { isDesktop } from "../lib/media";
import { navigate } from "../lib/router";

function MobileBar({ title }: { title: string }) {
  return (
    <header class="mp-appbar mp-appbar--bar bulk__bar">
      <div class="mp-appbar__row">
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("bulk.back")} onClick={() => (history.length > 1 ? history.back() : navigate("/nuevo"))}>
          <Icon name="arrow-left" />
        </button>
        <h1 class="mp-appbar__title">{title}</h1>
        <span class="bulk__bar-gap" />
      </div>
    </header>
  );
}

/** `/nuevo/varias`: pick many photos, review them, send. One page, five states (BUILD.md §7.3b). */
export default function BulkPage() {
  const desktop = isDesktop.value;
  const current = phase.value;
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    // Coming back after "¡Mandaste mecha!" starts fresh; anything else (reading, review, upload) is still running here.
    if (phase.value === "done") resetToChoose();
    void init();
  }, []);

  const n = counts.value.all;
  const title =
    current === "review" ? t(n === 1 ? "bulk.review.titleOne" : "bulk.review.title", { n })
    : current === "uploading" ? t("bulk.upload.title")
    : t("bulk.title");
  const split = desktop && current === "review";

  return (
    <div class={split ? "bulk bulk--split" : "bulk"} data-layout={desktop ? "desktop" : "mobile"} data-phase={current}>
      {current !== "done" && (desktop ? <AppHeader variant="desktop" active="map" /> : <MobileBar title={title} />)}
      {current === "choose" && <ChooseView />}
      {current === "reading" && <ReadingView />}
      {current === "review" && <ReviewView onOpen={setSheet} paused={sheet !== null} />}
      {current === "uploading" && <UploadView />}
      {current === "done" && <DoneView />}
      <div class="bulk-layer">
        <PhotoSheet id={sheet} onClose={() => setSheet(null)} />
      </div>
    </div>
  );
}
