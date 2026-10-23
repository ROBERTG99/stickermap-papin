import { Fragment, type ComponentChildren } from "preact";
import { useId, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { sourceMeta } from "./LocationPicker";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import type { LocationSource } from "../shared/types";

/* ── Shared helpers ───────────────────────────────────────────────────── */

/** Placeholder backgrounds of the design system's `mp-photo` (real photos go in the `thumb` slot instead). */
export type PhotoVariant = "pole" | "tiles" | "brick" | "snow" | "sign" | "night" | "stone" | "metal";

const TYPE_LABELS: Record<string, { label: string; contain: boolean }> = {
  papa: { label: "Papa", contain: true },
  "sexo-punto": { label: "Sexo.", contain: false },
  "sexo-pregunta": { label: "Sexo?", contain: false },
  "sexo-pregunta-og": { label: "Sexo? OG", contain: false },
  otro: { label: "Otro", contain: true },
};

function typeLabel(slug: string): string {
  return TYPE_LABELS[slug]?.label ?? slug;
}

function TypeSticker({ slug }: { slug: string }) {
  return (
    <span class={cx("mp-sticker", (TYPE_LABELS[slug]?.contain ?? true) && "mp-sticker--contain")}>
      <img src={`/img/icons/${slug}.png`} alt="" />
    </span>
  );
}

interface PhotoTileProps {
  variant: PhotoVariant;
  ratio: string;
  /** 1-based tilt token (1..4). */
  tiltNo: number;
  label: string;
  /** Real photo content; defaults to the sticker icon of `typeSlug` over the placeholder. */
  thumb?: ComponentChildren;
  typeSlug?: string;
}

function PhotoTile({ variant, ratio, tiltNo, label, thumb, typeSlug = "papa" }: PhotoTileProps) {
  return (
    <div
      class={cx("mp-photo", `mp-photo--${variant}`)}
      style={`--ratio:${ratio};--tilt:var(--tilt-${tiltNo})`}
      role="img"
      aria-label={label}
    >
      {thumb ?? <TypeSticker slug={typeSlug} />}
    </div>
  );
}

/* ── BatchItem ────────────────────────────────────────────────────────── */

/** One photo row of the bulk add. `kind` drives the look, never the colour alone. */
export type BatchRow =
  /** Lista: has a location and a type. */
  | { kind: "ready"; place: string; time: string | null; source: LocationSource; types: string[] }
  /** Sin ubicación: never added until placed or skipped. */
  | { kind: "noloc"; time: string | null }
  /** Ya está en el mapa. */
  | { kind: "exists"; time: string | null; place?: string }
  /** Repetida en este lote (`sameAs` = photo number). */
  | { kind: "dup"; time: string | null; sameAs: number }
  /** No se pudo leer. */
  | { kind: "error"; reason: string }
  /** Left out by the user ("Omitir"). */
  | { kind: "skipped"; time: string | null }
  /** Upload progress of a ready photo. */
  | { kind: "upload"; place: string; time: string | null; state: "queued" | "busy" | "done" | "failed"; progress?: number; detail?: string };

export type BatchFilter = "all" | "ready" | "noloc" | "skipped";

/** Which summary chip a row counts under (uploads count as ready). */
export function batchFilterOf(row: BatchRow): Exclude<BatchFilter, "all"> {
  switch (row.kind) {
    case "noloc":
      return "noloc";
    case "exists":
    case "dup":
    case "error":
    case "skipped":
      return "skipped";
    default:
      return "ready";
  }
}

export interface BatchItemProps {
  row: BatchRow;
  /** Position in the list: drives the stable tilt. */
  index: number;
  /** Photo number shown in labels ("Foto 3"); defaults to `index + 1`. */
  number?: number;
  /** The row whose pin is highlighted on the map (desktop). */
  selected?: boolean;
  /** Placeholder background (kitchen sink / loading); ignored when `thumb` is given. */
  variant?: PhotoVariant;
  /** Real thumbnail content for the `mp-photo` frame. */
  thumb?: ComponentChildren;
  onEdit?: () => void;
  onLocate?: () => void;
  onSkip?: () => void;
  onRestore?: () => void;
  onView?: () => void;
}

const VARIANTS: PhotoVariant[] = ["pole", "brick", "stone", "tiles", "metal", "night", "sign", "snow"];

function MetaClock({ time }: { time: string | null }) {
  return (
    <span>
      <Icon name="clock" />
      {time ?? "—"}
    </span>
  );
}

function Meta({ parts }: { parts: ComponentChildren[] }) {
  return (
    <span class="mp-bitem__meta">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function uploadState(state: "queued" | "busy" | "done" | "failed"): { label: string; text: string } {
  return { label: t(`components.batch.${state}`), text: t(`components.batch.${state}Text`) };
}

/** `li.mp-bitem`: one photo of the bulk add, in any review or upload state. Render inside `BatchList`. */
export function BatchItem(props: BatchItemProps) {
  const { row, index, selected, onEdit, onLocate, onSkip, onRestore, onView } = props;
  const n = props.number ?? index + 1;
  const variant = props.variant ?? VARIANTS[index % VARIANTS.length] ?? "pole";
  const typeSlug = row.kind === "ready" ? (row.types[0] ?? "papa") : "papa";

  let title: string;
  let meta: ComponentChildren[];
  let act: ComponentChildren = null;
  let modifier: string | false = false;
  let progress: number | null = null;

  switch (row.kind) {
    case "ready": {
      const src = sourceMeta(row.source);
      title = row.place;
      meta = [
        <MetaClock time={row.time} />,
        <span>
          <Icon name={src.icon} />
          {src.label}
        </span>,
        <span>
          {row.types.map((slug) => (
            <TypeSticker key={slug} slug={slug} />
          ))}
          {row.types.map(typeLabel).join(", ")}
        </span>,
      ];
      act = (
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("components.batch.editPhoto", { n })} onClick={onEdit}>
          <Icon name="more" />
        </button>
      );
      break;
    }
    case "noloc":
      modifier = "mp-bitem--noloc";
      title = t("components.batch.noLocation");
      meta = [<MetaClock time={row.time} />, <span>{t("components.batch.noGps")}</span>];
      act = (
        <>
          <button type="button" class="mp-btn mp-btn--primary mp-btn--sm" onClick={onLocate}>
            <Icon name="pin" size="sm" />
            {t("components.batch.locate")}
          </button>
          {onSkip && (
            <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={onSkip} aria-label={t("components.batch.skipPhoto", { n })}>
              {t("components.batch.skip")}
            </button>
          )}
        </>
      );
      break;
    case "exists":
      modifier = "mp-bitem--skip";
      title = t("components.batch.exists");
      meta = [<MetaClock time={row.time} />, ...(row.place ? [<span>{row.place}</span>] : [])];
      act = onView && (
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={onView} aria-label={t("components.batch.viewOnMap", { n })}>
          <Icon name="external" size="sm" />
          {t("components.batch.view")}
        </button>
      );
      break;
    case "dup":
      modifier = "mp-bitem--skip";
      title = t("components.batch.dup");
      meta = [<MetaClock time={row.time} />, <span>{t("components.batch.sameAs", { n: row.sameAs })}</span>];
      break;
    case "error":
      modifier = "mp-bitem--skip";
      title = t("components.batch.unreadable");
      meta = [<MetaClock time={null} />, <span>{row.reason}</span>];
      break;
    case "skipped":
      modifier = "mp-bitem--skip";
      title = t("components.batch.skipped");
      meta = [<MetaClock time={row.time} />, <span>{t("components.batch.notAdded")}</span>];
      act = onRestore && (
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={onRestore} aria-label={t("components.batch.includePhoto", { n })}>
          {t("components.batch.include")}
        </button>
      );
      break;
    case "upload": {
      const info = uploadState(row.state);
      title = row.place;
      const status =
        row.state === "busy" ? `${info.text} ${Math.round(row.progress ?? 0)}%`
        : row.state === "failed" ? (row.detail ?? info.text)
        : info.text;
      meta = [<MetaClock time={row.time} />, <span>{status}</span>];
      if (row.state === "failed") modifier = "mp-bitem--failed";
      if (row.state === "busy") progress = Math.max(0, Math.min(100, row.progress ?? 0));
      act = (
        <span class={cx("mp-bitem__state", `mp-bitem__state--${row.state}`)} role="img" aria-label={info.label}>
          {row.state === "queued" && <Icon name="clock" />}
          {row.state === "busy" && <span class="mp-spinner" />}
          {row.state === "done" && <Icon name="check" />}
          {row.state === "failed" && <Icon name="alert" />}
        </span>
      );
      break;
    }
  }

  return (
    <li class={cx("mp-bitem", modifier, selected && "is-selected")} tabindex={0}>
      <div class="mp-bitem__thumb">
        <PhotoTile
          variant={variant}
          ratio="1/1"
          tiltNo={(index % 4) + 1}
          label={t("components.photo.of", { n })}
          thumb={props.thumb}
          typeSlug={typeSlug}
        />
      </div>
      <div class="mp-bitem__body">
        <span class="mp-bitem__title">{title}</span>
        <Meta parts={meta} />
      </div>
      <div class="mp-bitem__act">{act}</div>
      {progress !== null && (
        <span
          class="mp-bitem__prog"
          role="progressbar"
          aria-label={t("components.batch.uploadingPhoto", { n })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <i style={`--value:${progress}%`} />
        </span>
      )}
    </li>
  );
}

/** `ul.mp-batch`: the stack of rows (8px gap). */
export function BatchList({ children, label }: { children?: ComponentChildren; label?: string }) {
  return (
    <ul class="mp-batch" aria-label={label}>
      {children}
    </ul>
  );
}

/* ── Drop zone ────────────────────────────────────────────────────────── */

const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_NAME.test(file.name);
}

async function readDirectory(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = dir.createReader();
  const out: File[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const entry of batch) out.push(...(await readEntry(entry)));
  }
  return out;
}

async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [file];
  }
  return entry.isDirectory ? readDirectory(entry as FileSystemDirectoryEntry) : [];
}

/** Images from a drop event, walking dropped folders (`webkitGetAsEntry`). Call it synchronously from the handler. */
export async function collectDroppedFiles(dt: DataTransfer, max = 100): Promise<File[]> {
  // Entries must be taken before the first await: the DataTransfer is emptied afterwards.
  const entries: FileSystemEntry[] = [];
  const plain: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) plain.push(file);
    }
  }
  const nested = await Promise.all(entries.map(readEntry));
  return [...plain, ...nested.flat()].filter(isImage).slice(0, max);
}

const ART: { variant: PhotoVariant; slug: string; tiltNo: number }[] = [
  { variant: "pole", slug: "papa", tiltNo: 4 },
  { variant: "brick", slug: "sexo-punto", tiltNo: 1 },
  { variant: "sign", slug: "otro", tiltNo: 2 },
  { variant: "tiles", slug: "papa", tiltNo: 3 },
];

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  /** `desktop`: "Soltá acá tus fotos"; `phone`: the "Elegir fotos" button only. */
  variant?: "desktop" | "phone";
  /** Max photos per batch. */
  max?: number;
  /** Force the "dragging over" look (e.g. when the whole page is the zone). */
  over?: boolean;
}

/** `mp-dropzone`: drop photos or folders, or pick them. No `capture`: the gallery picker keeps the GPS. */
export function DropZone({ onFiles, variant = "desktop", max = 100, over }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const phone = variant === "phone";
  const art = phone ? ART.slice(0, 3) : ART;

  const pickFiles = () => input.current?.click();

  return (
    <div
      class={cx("mp-dropzone", (over ?? dragging) && "is-over")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer) void collectDroppedFiles(e.dataTransfer, max).then((files) => files.length && onFiles(files));
      }}
    >
      <div class="mp-dropzone__art" aria-hidden="true">
        {art.map((a) => (
          <PhotoTile key={a.tiltNo} variant={a.variant} ratio="3/4" tiltNo={a.tiltNo} label={t("components.photo.alt", { type: typeLabel(a.slug) })} typeSlug={a.slug} />
        ))}
      </div>
      {!phone && <h2 class="mp-dropzone__title">{t("components.dropzone.title")}</h2>}
      {!phone && (
        <span class="mp-dropzone__hint">{t("components.dropzone.hintDesktop", { max })}</span>
      )}
      <button type="button" class={cx("mp-btn", phone ? "mp-btn--primary mp-btn--lg" : "mp-btn--secondary")} onClick={pickFiles}>
        <Icon name="image" />
        {phone ? t("components.dropzone.pickPhone") : t("components.dropzone.pickDesktop")}
      </button>
      {phone && <span class="mp-dropzone__hint">{t("components.dropzone.hintPhone", { max })}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []).filter(isImage).slice(0, max);
          e.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

/* ── iPhone picker hint ───────────────────────────────────────────────── */

/** `mp-pickerhint`: Safari drops the GPS unless "Opciones → Ubicación" is on. Shown always on iOS. */
export function IphoneHint({ selectedCount = 12 }: { selectedCount?: number }) {
  const titleId = useId();
  return (
    <section class="mp-pickerhint" aria-labelledby={titleId}>
      <h3 class="mp-pickerhint__title" id={titleId}>
        <Icon name="info" />
        {t("components.iphone.title")}
      </h3>
      <ol class="mp-pickerhint__steps">
        <li>
          {t("components.iphone.step1Pre")}
          <b>{t("components.iphone.step1Bold")}</b>
          {t("components.iphone.step1Post")}
        </li>
        <li>
          {t("components.iphone.step2Pre")}
          <b>{t("components.iphone.step2Bold")}</b>
          {t("components.iphone.step2Post")}
        </li>
      </ol>
      <div class="mp-pickerhint__mock" aria-hidden="true">
        <div class="mp-pickerhint__bar">
          <span>{t("components.iphone.selected", { n: selectedCount })}</span>
          <span class="mp-pickerhint__opts">
            {t("components.iphone.options")}
            <Icon name="chevron-down" size="sm" />
          </span>
        </div>
        <div class="mp-pickerhint__row">
          <span>{t("components.iphone.location")}</span>
          <span class="mp-pickerhint__toggle" />
        </div>
      </div>
      <span class="mp-field__hint">
        {t("components.iphone.warning")}
      </span>
    </section>
  );
}

/* ── Suggestions ──────────────────────────────────────────────────────── */

export interface LocationSuggestionProps {
  /** Time of the nearest located photo ("10:42"). */
  time: string;
  /** Its place name. */
  place: string;
  /** Extra line after the place (the dialog adds "tocá para usarla y ajustá el pin"). */
  hint?: string;
  /** Uses that photo's location as a starting point; the pin still has to be confirmed. */
  onUse: () => void;
}

/** `mp-suggest`: one-tap starting point for a photo without location. */
export function LocationSuggestion({ time, place, hint, onUse }: LocationSuggestionProps) {
  return (
    <button type="button" class="mp-suggest" onClick={onUse}>
      <Icon name="clock" />
      <span>
        {t("components.suggest.near", { time })}
        <small>{hint ? `${place} · ${hint}` : place}</small>
      </span>
      <Icon name="chevron-right" />
    </button>
  );
}

export interface SameStickerHintProps {
  /** Photo numbers of the pair. */
  a: number;
  b: number;
  meters: number;
  minutes: number;
  typeSlug?: string;
  /** Real thumbnail content for the two frames; defaults to placeholders. */
  thumbs?: [ComponentChildren, ComponentChildren];
  onMerge: () => void;
  onKeepSeparate: () => void;
}

/** `mp-same`: "¿Mismo sticker?". Nothing merges without a tap. */
export function SameStickerHint({ a, b, meters, minutes, typeSlug = "papa", thumbs, onMerge, onKeepSeparate }: SameStickerHintProps) {
  const label = t("components.photo.alt", { type: typeLabel(typeSlug) });
  return (
    <div class="mp-same" role="group" aria-label={t("components.same.group")}>
      <div class="mp-same__thumbs">
        <PhotoTile variant="pole" ratio="1/1" tiltNo={1} label={label} thumb={thumbs?.[0]} typeSlug={typeSlug} />
        <PhotoTile variant="pole" ratio="1/1" tiltNo={3} label={label} thumb={thumbs?.[1]} typeSlug={typeSlug} />
      </div>
      <div class="mp-same__text">
        <b>{t("components.same.title")}</b>
        {t("components.same.text", { a, b, meters, minutes })}
      </div>
      <div class="mp-same__actions">
        <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={onMerge}>
          <Icon name="merge" size="sm" />
          {t("components.same.merge")}
        </button>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={onKeepSeparate}>
          {t("components.same.keep")}
        </button>
      </div>
    </div>
  );
}

/* ── Summary filter chips ─────────────────────────────────────────────── */

export interface BatchSummaryProps {
  filter: BatchFilter;
  counts: Record<BatchFilter, number>;
  onFilterChange: (filter: BatchFilter) => void;
}

const FILTER_KEYS: BatchFilter[] = ["all", "ready", "noloc", "skipped"];

/** Filter chips above the list: Todas · Listas · Sin ubicación · Omitidas. One is pressed at a time. */
export function BatchSummary({ filter, counts, onFilterChange }: BatchSummaryProps) {
  return (
    <div class="mp-chips" role="group" aria-label={t("components.filter.group")}>
      {FILTER_KEYS.map((key) => {
        const pressed = filter === key;
        const warn = key === "noloc" && counts.noloc > 0 && !pressed;
        return (
          <button
            key={key}
            type="button"
            class="mp-chip"
            aria-pressed={pressed}
            style={warn ? { boxShadow: "inset 0 0 0 2px var(--alert)" } : undefined}
            onClick={() => onFilterChange(key)}
          >
            {t(`components.filter.${key}`)}
            <span class="mp-chip__count">{counts[key]}</span>
            <span class="mp-chip__tick">
              <Icon name="check" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
