import { cx } from "../lib/cx";

interface FlagProps {
  /** ISO-3166 alpha-2 country code (any case). */
  code: string;
  /** "lg" is the 30×20 ranking size; default is 21×14. */
  size?: "lg";
  class?: string;
}

/** Country flag as a small SVG. Decorative: always write the country name next to it. */
export function Flag({ code, size, class: className }: FlagProps) {
  return (
    <img
      class={cx("mp-flag", size === "lg" && "mp-flag--lg", className)}
      src={`/flags/${code.trim().toLowerCase()}.svg`}
      alt=""
      loading="lazy"
    />
  );
}
