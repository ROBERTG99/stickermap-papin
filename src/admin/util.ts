import { ApiError } from "../lib/api";
import { formatDate } from "../lib/format";
import { t } from "../lib/i18n";
import { toast } from "../lib/toast";

const ERROR_KEYS: Record<string, string> = {
  slug_exists: "admin.error.slugExists",
  icon_required: "admin.error.iconRequired",
  bad_icon: "admin.error.badIcon",
  name_exists: "admin.error.nameExists",
  unknown_type: "admin.error.unknownType",
  other_requires_names: "admin.error.otherRequiresNames",
  self_requires_reporter: "admin.error.selfRequiresReporter",
  no_backup_yet: "admin.error.noBackup",
  not_found: "admin.error.notFound",
  unauthorized: "admin.error.unauthorized",
  invalid: "admin.error.invalid",
};

/** Says what happened and what to do next (design README, voice). */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.offline) return t("admin.error.offline");
    if (e.status === 401) return t("admin.error.unauthorized");
    const key = ERROR_KEYS[e.code];
    if (key) return t(key);
  }
  return t("admin.error.generic");
}

export function toastError(e: unknown): void {
  toast.show({ kind: "error", message: errorText(e) });
}

/** Run an API call; on failure show the error toast and resolve null. */
export async function attempt<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    toastError(e);
    return null;
  }
}

/** "hace 5 min" · "hace 3 h" · "hace 4 días" · then the date. */
export function formatAgo(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return t("admin.time.now");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("admin.time.minutes", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("admin.time.hours", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("admin.time.days", { n: d });
  return formatDate(iso);
}

export { formatBytes, groupCounts, parseCoords, placeLabel, slugify } from "./text";
