import type { IconFit, StickerType } from "../shared/types";
import { cx } from "../lib/cx";

/** Small pieces shared by the map surfaces (marker, legend, spot block, lightbox). */

/** Stable 32-bit string hash (djb2 xor variant). Same input, same output, on every device. */
export function hashString(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
  return h;
}

/** `var(--tilt-1..4)` from a list index: stable, never random. */
export function tiltByIndex(index: number): string {
  return `var(--tilt-${(((index % 4) + 4) % 4) + 1})`;
}

/** `var(--tilt-1..4)` from an id (hash mod 4): the same spot always leans the same way. */
export function tiltById(id: string): string {
  return `var(--tilt-${(hashString(id) % 4) + 1})`;
}

/** Sticker type icon as a die-cut circle (`mp-sticker`), `contain` for cut-outs like Papa and Otro. */
export function TypeSticker({
  type,
  tilt,
  class: className,
}: {
  type: Pick<StickerType, "icon" | "fit">;
  /** A CSS tilt value such as `var(--tilt-2)`. */
  tilt?: string;
  class?: string;
}) {
  return (
    <span
      class={cx("mp-sticker", type.fit === "contain" && "mp-sticker--contain", className)}
      style={tilt ? `--tilt:${tilt}` : undefined}
    >
      <img src={type.icon} alt="" draggable={false} />
    </span>
  );
}

/** Country flag (`mp-flag`) from the ISO code; decorative, the country name sits next to it. */
export function Flag({ code, large }: { code: string; large?: boolean }) {
  return <img class={cx("mp-flag", large && "mp-flag--lg")} src={`/flags/${code.toLowerCase()}.svg`} alt="" />;
}

/** Avatar colour 1-6 from a stable hash of the name. */
export function avatarNumber(name: string): number {
  return (hashString(name) % 6) + 1;
}

/** "Beto" -> "Ch", "Hugo" -> "Iñ". */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const chars = Array.from(trimmed);
  return (chars[0] ?? "").toUpperCase() + (chars[1] ?? "").toLowerCase();
}

export function PlacerAvatar({ name, index = 0, size = 34 }: { name: string; index?: number; size?: number }) {
  const n = avatarNumber(name);
  return (
    <span
      class={cx("mp-avatar", n > 1 && `mp-avatar--${n}`)}
      style={`--s:${size}px;--tilt:${tiltByIndex(index)}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "15 abr 2025", or "hace 3 h" / "hace 12 min" when under 24 h. Returns "" for a missing date. */
export function formatSpotDate(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const diff = now - time;
  if (diff >= 0 && diff < 24 * 3_600_000) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours >= 1) return `hace ${hours} h`;
    return `hace ${Math.max(1, Math.floor(diff / 60_000))} min`;
  }
  const d = new Date(time);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

/** Joins names the way the sheet shows them: "Beto, Caro". An unknown placer is "¿?". */
export function placersLabel(placers: string[]): string {
  return placers.length > 0 ? placers.join(", ") : "¿?";
}

/** Marker/legend helper: the fit of a type as the marker head modifier. */
export function isContain(fit: IconFit): boolean {
  return fit === "contain";
}
