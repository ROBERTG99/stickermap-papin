import type { ComponentChildren } from "preact";
import { cx } from "../lib/cx";
import { Icon, type IconName } from "./Icon";

export type BannerKind = "offline" | "countdown" | "error" | "info";

const DEFAULT_ICON: Record<BannerKind, IconName> = {
  offline: "wifi-off",
  countdown: "clock",
  error: "alert",
  info: "info",
};

interface BannerProps {
  kind: BannerKind;
  /** Override the default line icon for the kind. */
  icon?: IconName;
  children: ComponentChildren;
  /** Optional action at the right edge ("Reintentar"). */
  action?: { label: string; onClick: () => void };
  class?: string;
}

/** Inline message that persists until the condition changes. */
export function Banner({ kind, icon, children, action, class: className }: BannerProps) {
  const role = kind === "error" ? "alert" : kind === "offline" ? "status" : undefined;
  return (
    <div class={cx("mp-banner", `mp-banner--${kind}`, className)} role={role}>
      <Icon name={icon ?? DEFAULT_ICON[kind]} />
      <span>{children}</span>
      {action && (
        <button
          type="button"
          class={cx("mp-btn mp-btn--sm mp-banner__action", kind !== "offline" && "mp-btn--secondary")}
          style={kind === "offline" ? { background: "var(--on-alert)", color: "var(--alert)" } : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface FirstVisitHintProps {
  onDismiss: () => void;
  class?: string;
}

/** One-step first-visit card (mint sticker with a peel corner). Show once, dismiss on any map tap. */
export function FirstVisitHint({ onDismiss, class: className }: FirstVisitHintProps) {
  return (
    <div class={cx("mp-hint", className)}>
      <div class="mp-hint__row">
        <span class="mp-marker" style={{ "--tilt": "var(--tilt-2)" }} aria-hidden="true">
          <span class="mp-marker__head mp-marker__head--contain">
            <img src="/img/icons/papa.png" alt="" />
          </span>
          <span class="mp-marker__tail" />
          <span class="mp-marker__dot" />
        </span>
        Tocá un sticker para ver la foto
      </div>
      <div class="mp-hint__row">
        <span class="mp-fab mp-fab--round" style={{ width: "var(--tap-min)", height: "var(--tap-min)" }} aria-hidden="true">
          <Icon name="plus" />
        </span>
        Agregá el tuyo con +
      </div>
      <button type="button" class="mp-btn mp-btn--primary" style={{ justifySelf: "start" }} onClick={onDismiss}>
        ¡Dale!
      </button>
    </div>
  );
}
