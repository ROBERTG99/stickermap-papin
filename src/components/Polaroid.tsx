import { cx } from "../lib/cx";
import type { IconFit } from "../shared/types";
import { tiltStyle } from "./Avatar";

/** Sticker types whose icon is drawn `contain` when the API does not say (papa, otro). */
const CONTAIN_SLUGS = new Set(["papa", "otro"]);

export interface StickerTypeRef {
  slug: string;
  /** Icon URL from `/api/types`; defaults to `/img/icons/<slug>.png`. */
  icon?: string;
  fit?: IconFit;
}

interface TypeStickerProps {
  type: StickerTypeRef;
  /** Diameter in px (default from CSS: 28; polaroid 32). */
  size?: number;
  /** Stable tilt from a list position. */
  index?: number;
  class?: string;
}

/** Round die-cut sticker with a type icon (`mp-sticker`). Decorative: the label is written next to it. */
export function TypeSticker({ type, size, index, class: className }: TypeStickerProps) {
  const fit = type.fit ?? (CONTAIN_SLUGS.has(type.slug) ? "contain" : "cover");
  const style: Record<string, string> = index === undefined ? {} : tiltStyle(index);
  if (size) style["--s"] = `${size}px`;
  return (
    <span class={cx("mp-sticker", fit === "contain" && "mp-sticker--contain", className)} style={style}>
      <img src={type.icon ?? `/img/icons/${type.slug}.png`} alt="" />
    </span>
  );
}

export type PhotoTone = "pole" | "tiles" | "brick" | "snow" | "sign" | "night" | "stone" | "metal";

export interface PolaroidProps {
  /** Link target, `/s/<id>` (opens the spot on the map). */
  href: string;
  /** Position in the masonry: tilt = index % 4. */
  index: number;
  /** Sticker types on the print: 2 shown, "+n" beyond that. */
  types: readonly (StickerTypeRef & { label: string })[];
  /** Thumbnail URL; when missing, a photo placeholder is drawn (samples, spots without photo). */
  photoSrc?: string | null;
  /** CSS aspect ratio of the photo, e.g. "4/5". */
  ratio?: string;
  /** Placeholder style when there is no photoSrc. */
  tone?: PhotoTone;
  place: string;
  /** Placer name; null or empty shows "¿?". */
  placer: string | null;
  class?: string;
}

/** Gallery tile: the photo as a tilted die-cut print with its type stickers on the corner. */
export function Polaroid({ href, index, types, photoSrc, ratio = "4/5", tone = "stone", place, placer, class: className }: PolaroidProps) {
  const shown = types.slice(0, 2);
  const extra = types.length - shown.length;
  const alt = `Foto: sticker ${types.map((t) => t.label).join(", ")}`;
  const lead = shown[0];
  return (
    <a class={cx("mp-polaroid", className)} href={href} style={tiltStyle(index)}>
      <span class="mp-polaroid__types">
        {shown.map((t) => (
          <TypeSticker key={t.slug} type={t} />
        ))}
        {extra > 0 && <span class="mp-badge mp-badge--plus">+{extra}</span>}
      </span>
      {photoSrc ? (
        <img src={photoSrc} alt={alt} loading="lazy" style={{ display: "block", width: "100%", height: "auto", borderRadius: "3px" }} />
      ) : (
        <div class={cx("mp-photo", `mp-photo--${tone}`)} style={{ "--ratio": ratio, "--tilt": "var(--tilt-1)" }} role="img" aria-label={alt}>
          {lead && <TypeSticker type={lead} />}
        </div>
      )}
      <span class="mp-polaroid__place">{place}</span>
      <span class="mp-polaroid__by">Pegado por {placer?.trim() || "¿?"}</span>
    </a>
  );
}
