import type { ComponentChildren } from "preact";
import { cx } from "../lib/cx";
import { Icon, type IconName } from "./Icon";

export type BadgeVariant = "neutral" | "brand" | "inverse" | "alert" | "solid" | "plus";

interface BadgeProps {
  variant?: BadgeVariant;
  /** Optional leading line icon (status and review-reason badges carry icon + words). */
  icon?: IconName;
  children: ComponentChildren;
  class?: string;
}

/** Small status label. Badges are never buttons. */
export function Badge({ variant = "neutral", icon, children, class: className }: BadgeProps) {
  return (
    <span class={cx("mp-badge", variant !== "neutral" && `mp-badge--${variant}`, className)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

interface CountBadgeProps {
  count: number;
  class?: string;
}

/** Brand circle with the active-filter count. Hidden from assistive tech: the button's aria-label carries the count. */
export function CountBadge({ count, class: className }: CountBadgeProps) {
  return (
    <span class={cx("mp-countbadge", className)} aria-hidden="true">
      {count}
    </span>
  );
}

interface SourceBadgeProps {
  icon: IconName;
  /** "manual" for a hand-moved pin, "pending" shows a spinner, "warn" when accuracy is worse than ±100 m. */
  variant?: "manual" | "pending" | "warn";
  children: ComponentChildren;
  class?: string;
}

/** Where a pin's location came from: line icon + words, never emoji. */
export function SourceBadge({ icon, variant, children, class: className }: SourceBadgeProps) {
  return (
    <span class={cx("mp-src", variant && `mp-src--${variant}`, className)}>
      {variant === "pending" ? <span class="mp-spinner" aria-hidden="true" /> : <Icon name={icon} />}
      {children}
    </span>
  );
}
