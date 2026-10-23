import { cx } from "../lib/cx";
import { tiltStyle } from "./Avatar";
import { TypeSticker, type StickerTypeRef } from "./Polaroid";

/** Whole number with a dot as thousands separator: 19609 → "19.609". */
export function formatInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type StatTone = "mint" | "brand" | "butter" | "peach" | "die";

interface StatStickerProps {
  value: number;
  label: string;
  tone?: StatTone;
  /** Position in the row: tilt = index % 4. */
  index: number;
  class?: string;
}

/** Hero number as a big tilted sticker. Never more than four per screen. */
export function StatSticker({ value, label, tone = "mint", index, class: className }: StatStickerProps) {
  return (
    <div class={cx("mp-stat", tone !== "mint" && `mp-stat--${tone}`, className)} style={tiltStyle(index)}>
      <span class="mp-stat__num">{formatInt(value)}</span>
      <span class="mp-stat__label">{label}</span>
    </div>
  );
}

interface TypeCountProps {
  type: StickerTypeRef & { label: string };
  count: number;
  /** Count of the top type: the bar is relative to it. */
  max: number;
  class?: string;
}

/** Per-type row: sticker (36px) + label + bar + count. Zero counts are shown. */
export function TypeCount({ type, count, max, class: className }: TypeCountProps) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div class={cx("mp-typecount", className)}>
      <TypeSticker type={type} size={36} />
      <div style={{ display: "grid", gap: "var(--space-1)" }}>
        <span class="mp-typecount__label">{type.label}</span>
        <span class="mp-typecount__bar" aria-hidden="true">
          <i style={{ "--value": `${pct}%` }} />
        </span>
      </div>
      <span class="mp-typecount__n">{formatInt(count)}</span>
    </div>
  );
}
