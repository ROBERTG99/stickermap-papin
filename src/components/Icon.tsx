import { ICONS, type IconName } from "../lib/icons.generated";
import { cx } from "../lib/cx";

export type { IconName };

interface IconProps {
  name: IconName;
  size?: "sm" | "lg";
  class?: string;
  /** Accessible name for icon-only use; omit when the icon is decorative (a text label sits next to it). */
  label?: string;
}

/** 24px line icon from the design-system sprite (`<svg class="mp-i"><use href="#i-name"/></svg>`). */
export function Icon({ name, size, class: className, label }: IconProps) {
  return (
    <svg
      class={cx("mp-i", size === "sm" && "mp-i--sm", size === "lg" && "mp-i--lg", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}

const SYMBOLS = Object.entries(ICONS)
  .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
  .join("");

/** Render once near the root of the app: defines every `#i-<name>` symbol. */
export function IconSprite() {
  return (
    <svg
      id="mp-sprite"
      xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;width:0;height:0;overflow:hidden"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SYMBOLS }}
    />
  );
}
