import { useEffect, useState } from "preact/hooks";
import { ConfirmDialog } from "../../components/Dialog";
import { t } from "../../lib/i18n";
import { submitReport } from "./actions";

export interface ReportTarget {
  id: string;
}

interface Props {
  target: ReportTarget | null;
  onClose: () => void;
}

/** "Reportar": a confirm; the admin sees the spot in the review queue. */
export function ReportDialog({ target, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const open = target !== null;

  useEffect(() => {
    if (open) setBusy(false);
  }, [open, target?.id]);

  if (!target) return null;

  const send = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await submitReport(target.id);
    setBusy(false);
    if (ok) onClose();
  };

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
