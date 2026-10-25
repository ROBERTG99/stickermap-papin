import { useEffect, useRef, useState } from "preact/hooks";
import { copyLink, downloadBlob, shareImage, type CardTheme } from "../lib/canvas-card";
import { t } from "../lib/i18n";
import { renderStory, type StoryInput } from "../lib/story";
import { toast } from "../lib/toast";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Segmented } from "./Segmented";

interface StorySheetProps {
  open: boolean;
  onClose: () => void;
  /** The share link; printed on the image and copied to the clipboard. */
  link: string;
  filename: string;
  input: StoryInput | null;
}

/** "Compartir en historia" (F2): preview of the 1080×1920 image with a background choice, then the native share sheet or a download. */
export function StorySheet({ open, onClose, link, filename, input }: StorySheetProps) {
  const [theme, setTheme] = useState<CardTheme>("mint");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (!open || !input) return;
    const mine = ++run.current;
    setBlob(null);
    setFailed(false);
    renderStory(input, theme)
      .then((b) => {
        if (run.current !== mine) return;
        setBlob(b);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      })
      .catch(() => { if (run.current === mine) setFailed(true); });
  }, [open, input, theme]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function share() {
    if (!blob) return;
    const copied = await copyLink(link);
    const outcome = await shareImage(blob, { filename, title: t("share.story.title"), text: t("share.story.text"), url: link });
    if (outcome === "cancelled") return;
    toast.show({ message: t(copied ? "share.story.linkCopied" : "share.story.saved"), kind: "success" });
    if (outcome === "shared") onClose();
  }

  function download() {
    if (!blob) return;
    downloadBlob(blob, filename);
    void copyLink(link).then((ok) => toast.show({ message: t(ok ? "share.story.linkCopied" : "share.story.saved"), kind: "success" }));
  }

  return (
    <Dialog
      open={open}
      title={t("share.story.title")}
      onClose={onClose}
      actions={
        <>
          <Button variant="primary" icon="share" disabled={!blob} onClick={() => void share()}>{t("share.story.share")}</Button>
          <Button variant="quiet" icon="download" disabled={!blob} onClick={download}>{t("share.story.download")}</Button>
        </>
      }
    >
      <div style={{ display: "grid", justifyItems: "center", gap: "var(--space-3)" }}>
        <div class="mp-story" style={{ "--w": "min(220px, 52vw)", background: "var(--surface-sunken)" }} role="img" aria-label={t("share.story.preview")}>
          {preview ? <img src={preview} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} /> : <span class="mp-field__hint" style={{ margin: "auto" }}>{failed ? t("share.story.failed") : t("share.story.preparing")}</span>}
        </div>
        <Segmented<CardTheme>
          ariaLabel={t("share.story.background")}
          value={theme}
          onChange={setTheme}
          options={[
            { value: "mint", label: t("share.story.mint") },
            { value: "brand", label: t("share.story.brand") },
            { value: "ink", label: t("share.story.ink") },
          ]}
        />
      </div>
    </Dialog>
  );
}
