import type { BadgeVariant } from "../components/Badge";
import type { IconName } from "../components/Icon";

export interface ReasonMeta {
  icon: IconName;
  variant: BadgeVariant;
  /** i18n key of the badge text. */
  label: string;
  /** i18n key of the sentence shown above the editor in the detail pane. */
  help: string;
}

/** Review reasons written by the migration, the report form and the upload checks (BUILD.md §6, §7.4). */
const REASONS: Record<string, ReasonMeta> = {
  duplicate_photo_far_apart: { icon: "copy", variant: "alert", label: "admin.reason.duplicate_photo_far_apart.label", help: "admin.reason.duplicate_photo_far_apart.help" },
  exif_gps_mismatch: { icon: "pin", variant: "alert", label: "admin.reason.exif_gps_mismatch.label", help: "admin.reason.exif_gps_mismatch.help" },
  reported: { icon: "flag", variant: "solid", label: "admin.reason.reported.label", help: "admin.reason.reported.help" },
  legacy_other_no_data: { icon: "image", variant: "neutral", label: "admin.reason.legacy_other_no_data.label", help: "admin.reason.legacy_other_no_data.help" },
  video_needs_transcode: { icon: "video", variant: "alert", label: "admin.reason.video_needs_transcode.label", help: "admin.reason.video_needs_transcode.help" },
  deleted: { icon: "trash", variant: "inverse", label: "admin.reason.deleted.label", help: "admin.reason.deleted.help" },
};

/** Quick-filter chips of the queue, in this order (only the ones that have spots are shown). */
export const QUEUE_REASONS = ["duplicate_photo_far_apart", "exif_gps_mismatch", "reported", "video_needs_transcode", "legacy_other_no_data"] as const;

const FALLBACK: ReasonMeta = { icon: "info", variant: "neutral", label: "", help: "admin.reason.other.help" };

/** Metadata of a reason code; unknown codes keep working (badge shows the raw code). */
export function reasonMeta(code: string): ReasonMeta {
  return REASONS[code] ?? FALLBACK;
}

export const isKnownReason = (code: string): boolean => code in REASONS;
