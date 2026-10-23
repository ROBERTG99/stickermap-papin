import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { toast, type ToastAction, type ToastKind } from "../lib/toast";
import { Icon, type IconName } from "./Icon";

const ICON: Record<ToastKind, IconName> = { success: "check", error: "alert", info: "info" };

interface ToastProps {
  kind?: ToastKind;
  message: string;
  action?: ToastAction;
  /** Optional close button (used by toasts that stay until acted on or closed). */
  onClose?: () => void;
  /** Set a live-region role on the toast itself ("alert" for errors, "status" otherwise). Default true. */
  announce?: boolean;
  class?: string;
}

/** Brief, non-blocking confirmation on an inverse surface. Use `toast.show()` + `<ToastHost />` in the app. */
export function Toast({ kind = "info", message, action, onClose, announce = true, class: className }: ToastProps) {
  const role = announce ? (kind === "error" ? "alert" : "status") : undefined;
  return (
    <div class={cx("mp-toast", `mp-toast--${kind}`, className)} role={role}>
      <span class="mp-toast__icon">
        <Icon name={ICON[kind]} />
      </span>
      <span class="mp-toast__text">{message}</span>
      {action && (
        <button type="button" class="mp-toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onClose && (
        <button type="button" class="mp-toast__action" onClick={onClose} aria-label={t("components.toast.close")}>
          <Icon name="x" size="sm" />
        </button>
      )}
    </div>
  );
}

/** Mount once near the root: shows the toast store's current toast at the top of the screen. */
export function ToastHost() {
  const item = toast.current.value;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top) + var(--space-3))",
        left: "var(--space-4)",
        right: "var(--space-4)",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: "var(--z-toast)",
      }}
    >
      {item && (
        <div key={item.id} style={{ pointerEvents: "auto" }}>
          <Toast
            kind={item.kind}
            message={item.message}
            announce={item.kind === "error"}
            action={
              item.action && {
                label: item.action.label,
                onClick: () => {
                  item.action?.onClick();
                  toast.dismiss();
                },
              }
            }
            onClose={item.durationMs === 0 ? () => toast.dismiss() : undefined}
          />
        </div>
      )}
    </div>
  );
}
