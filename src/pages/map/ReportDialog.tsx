import { useEffect, useId, useRef, useState } from "preact/hooks";
import { ConfirmDialog, Dialog } from "../../components/Dialog";
import { t } from "../../lib/i18n";
import { submitReport, type ReportReason } from "./actions";

export interface ReportTarget {
  id: string;
  reason: ReportReason;
}

interface Props {
  target: ReportTarget | null;
  onClose: () => void;
}

/** "Reportar": a confirm for the plain report, a name field for "Sé quién lo pegó" (the admin assigns the placer). */
export function ReportDialog({ target, onClose }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    setName("");
    setBusy(false);
    if (target?.reason === "know_placer") setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, target?.id, target?.reason]);

  if (!target) return null;

  const send = async () => {
    if (busy) return;
    const note = target.reason === "know_placer" ? name.trim() : "";
    if (target.reason === "know_placer" && !note) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    const ok = await submitReport(target.id, target.reason, note || null);
    setBusy(false);
    if (ok) onClose();
  };

  if (target.reason === "reported") {
    return (
      <ConfirmDialog
        open
        title={t("map.report.title")}
        body={t("map.report.body")}
        confirmLabel={t("map.report.confirm")}
        cancelLabel={t("map.report.cancel")}
        icon="flag"
        onConfirm={() => void send()}
        onCancel={onClose}
      />
    );
  }

  return (
    <Dialog
      open
      title={t("map.report.knowTitle")}
      onClose={onClose}
      art={
        <div class="mp-field">
          <label class="mp-field__label" for={fieldId}>{t("map.report.knowLabel")}</label>
          <span class="mp-field__hint">{t("map.report.knowBody")}</span>
          <input
            ref={inputRef}
            id={fieldId}
            class="mp-input"
            type="text"
            maxLength={60}
            autoComplete="off"
            placeholder={t("map.report.knowPlaceholder")}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
        </div>
      }
      actions={
        <>
          <button type="button" class="mp-btn mp-btn--primary" disabled={busy || name.trim() === ""} onClick={() => void send()}>
            {t("map.report.send")}
          </button>
          <button type="button" class="mp-btn mp-btn--secondary" onClick={onClose}>
            {t("map.report.cancel")}
          </button>
        </>
      }
    />
  );
}
