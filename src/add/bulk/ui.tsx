import type { BatchRow } from "../../components/BatchItem";
import { t } from "../../lib/i18n";
import { formatCoords, formatNumber } from "../../lib/format";
import { effectiveCoords } from "./classify";
import { clockOf, effectiveTypes } from "./effective";
import { defaults, placeLabel, thumbUrls, type Row } from "./bulk";
import type { MapPoint } from "./map";
import type { PhotoMeta } from "./types";

/** The 400 px thumbnail of a photo (an object URL from the IndexedDB draft), or nothing while it is being read. */
export function Thumb({ id }: { id: string }) {
  const url = thumbUrls.value.get(id);
  return url ? <img class="bulk-thumb" src={url} alt="" draggable={false} /> : null;
}

/** Where a photo is, in words: the place name when known, else the coordinates. */
export function whereLabel(p: PhotoMeta): string {
  const named = placeLabel(p);
  if (named) return named;
  const { lat, lng } = effectiveCoords(p);
  return lat !== null && lng !== null ? formatCoords(lat, lng) : t("bulk.noLocation");
}

/** The row that `BatchItem` draws for a review entry. */
export function toBatchRow(row: Row): BatchRow {
  const p = row.photo;
  const time = clockOf(p.takenAt);
  const d = defaults.value;
  switch (row.status) {
    case "ready":
      return { kind: "ready", place: whereLabel(p), time, source: p.placed?.source ?? "exif", types: d ? effectiveTypes(p, d) : [] };
    case "no-location":
      return { kind: "noloc", time };
    case "exists":
      return { kind: "exists", time };
    case "dup-batch":
      return { kind: "dup", time, sameAs: row.sameAsNumber ?? 1 };
    case "error":
      return { kind: "error", reason: t(`bulk.reason.${p.error ?? "cant-read"}`) };
    case "omitted":
      return { kind: "skipped", time };
  }
}

export function mapPoints(rows: readonly Row[]): MapPoint[] {
  const d = defaults.value;
  return rows.flatMap((r) => {
    const { lat, lng } = effectiveCoords(r.photo);
    return lat === null || lng === null ? [] : [{ id: r.photo.id, lat, lng, typeSlug: d ? (effectiveTypes(r.photo, d)[0] ?? null) : null }];
  });
}

/** "≈ 180 MB" */
export function approxSize(bytes: number): string {
  const mb = bytes / 1_048_576;
  if (mb >= 1000) return `≈ ${formatNumber(mb / 1024, 1)} GB`;
  return mb < 1 ? "< 1 MB" : `≈ ${formatNumber(Math.round(mb))} MB`;
}

export function plural(n: number, one: string, other: string, vars: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : other, { n, ...vars });
}
