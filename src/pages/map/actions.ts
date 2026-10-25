import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import { config } from "../../lib/store";
import { getTurnstileToken } from "../../lib/turnstile";
import { spotUrl } from "../../map/spot-view";

/** "Compartir": the native share sheet when there is one, otherwise copy the `/s/<id>` link and say so. */
export async function shareSpot(id: string, place: string): Promise<void> {
  const url = spotUrl(id, location.origin);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: place, url });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // the user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.show({ message: t("map.spot.linkCopied"), kind: "success" });
  } catch {
    toast.show({ message: t("map.spot.shareFailed"), kind: "error" });
  }
}

/** Sends a report (Turnstile token first). Returns true when it went through; failures show a toast with "Reintentar". */
export async function submitReport(id: string): Promise<boolean> {
  try {
    const sitekey = config.value?.turnstile_sitekey;
    const turnstile_token = sitekey ? await getTurnstileToken(sitekey) : null;
    await api.report(id, { turnstile_token });
    toast.show({ message: t("map.report.done"), kind: "success" });
    return true;
  } catch {
    toast.show({
      message: t("map.report.failed"),
      kind: "error",
      action: { label: t("common.action.retry"), onClick: () => void submitReport(id) },
    });
    return false;
  }
}
