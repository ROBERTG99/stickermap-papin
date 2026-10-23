import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { collectDroppedFiles, DropZone, IphoneHint } from "../../components/BatchItem";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/Dialog";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";
import { discardDraft, continueDraft, overLimit, pendingReplace, resumable, startFiles } from "./bulk";
import { isImageFile, isIos } from "./read";
import { summarizeDraft } from "./classify";
import { plural } from "./ui";

/** Banner for a draft that is still on disk. */
function ResumeBanner() {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const found = resumable.value;
  if (!found) return null;
  const { draft, photos } = found;
  const sum = summarizeDraft(draft.phase, photos, draft.sendNo);
  const unfinishedUpload = draft.phase === "uploading" && sum.unfinished;
  const leftoversOnly = draft.phase === "done";
  const live = photos.filter((p) => !p.error && p.upload.state !== "done" && p.upload.state !== "exists").length;
  const text = unfinishedUpload
    ? t("bulk.resume.uploading", { done: unfinishedUpload.done, total: unfinishedUpload.total })
    : leftoversOnly
      ? plural(sum.unplaced, "bulk.resume.unplacedOne", "bulk.resume.unplaced")
      : plural(live, "bulk.resume.reviewOne", "bulk.resume.review");
  return (
    <>
      <div class="mp-banner mp-banner--resume" role="status">
        <Icon name="clock" />
        <span>{text}</span>
        <button type="button" class="mp-btn mp-btn--primary mp-btn--sm mp-banner__action" onClick={() => void continueDraft()}>
          {leftoversOnly ? t("bulk.resume.locate") : t("bulk.resume.continue")}
        </button>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={() => setConfirmDiscard(true)}>
          {t("bulk.resume.discard")}
        </button>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        danger
        title={t("bulk.discard.title")}
        body={t("bulk.discard.body")}
        confirmLabel={t("bulk.discard.confirm")}
        onConfirm={() => { setConfirmDiscard(false); void discardDraft(); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}

/** Files that arrived while a draft is on disk wait here for a yes. */
function ReplaceDialog() {
  const files = pendingReplace.value;
  return (
    <ConfirmDialog
      open={files !== null}
      danger
      icon="rotate"
      title={t("bulk.replace.title")}
      body={t("bulk.replace.body")}
      confirmLabel={t("bulk.replace.confirm")}
      onConfirm={() => { pendingReplace.value = null; if (files) void startFiles(files); }}
      onCancel={() => { pendingReplace.value = null; }}
    />
  );
}

/** Takes the files from a pick or a drop. A draft on disk is only replaced after a yes. */
export function offerFiles(files: File[]): void {
  const images = files.filter(isImageFile);
  if (images.length === 0) return;
  if (resumable.value) pendingReplace.value = images;
  else void startFiles(images);
}

function PageDrop({ children }: { children: ComponentChildren }) {
  const [over, setOver] = useState(false);
  return (
    <div
      class="bulk__stack"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      // Capture: the whole page is the zone, and the count is ours (the DropZone alone would silently keep 100).
      onDropCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (e.dataTransfer) void collectDroppedFiles(e.dataTransfer, Number.MAX_SAFE_INTEGER).then(offerFiles);
      }}
      onChangeCapture={(e) => {
        const input = e.target as HTMLInputElement;
        if (input.type !== "file") return;
        e.stopPropagation();
        const picked = Array.from(input.files ?? []);
        input.value = "";
        offerFiles(picked);
      }}
      data-over={over ? "true" : undefined}
    >
      {isDesktop.value ? <DropZoneWrap over={over} /> : <DropZoneWrap over={false} phone />}
      {children}
    </div>
  );
}

function DropZoneWrap({ over, phone }: { over: boolean; phone?: boolean }) {
  return <DropZone variant={phone ? "phone" : "desktop"} over={over || undefined} onFiles={offerFiles} />;
}

export function ChooseView() {
  const desktop = isDesktop.value;
  return (
    <div class="bulk__main">
      <ResumeBanner />
      <div class="bulk__head">
        <h1 class="bulk__title">{desktop ? t("bulk.titleDesktop") : t("bulk.choose.title")}</h1>
        <p class="bulk__lead">{t("bulk.choose.lead")}</p>
      </div>
      {overLimit.value && <div class="mp-banner mp-banner--info" role="status"><Icon name="info" />{t("bulk.limit")}</div>}
      <PageDrop>
        {isIos() && <IphoneHint selectedCount={12} />}
        {desktop && <p class="bulk__tip">{t("bulk.choose.desktopTip")}</p>}
      </PageDrop>
      <ReplaceDialog />
    </div>
  );
}

