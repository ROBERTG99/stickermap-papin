import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { cx } from "../lib/cx";
import { Icon, type IconName } from "./Icon";

export type DialogLayout = "auto" | "sheet" | "centered";

interface DialogProps {
  open: boolean;
  /** `alertdialog` for destructive or reporting decisions. */
  role?: "dialog" | "alertdialog";
  title: string;
  /** What the dialog is about (a thumbnail and a line of text), shown in a sunken block. */
  art?: ComponentChildren;
  /** Body copy. */
  children?: ComponentChildren;
  /** Stacked buttons, recommended action first. */
  actions: ComponentChildren;
  /** Esc, the grab handle and (for plain dialogs) the scrim call this. */
  onClose: () => void;
  /** `auto`: bottom sheet below 768px, centred (max 440px) above. */
  layout?: DialogLayout;
  /** Fill the nearest positioned ancestor instead of the viewport (framed previews). */
  contained?: boolean;
  /**
   * Focus management and keys. Turn off only for a purely visual specimen:
   * no autofocus, no focus trap, no Esc.
   */
  interactive?: boolean;
  class?: string;
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDesktop(): boolean {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mql = matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return matches;
}

/** Interrupting decision: modal bottom sheet on mobile, centred card on desktop. Traps focus, Esc closes, focus returns to the trigger. */
export function Dialog({ open, role = "dialog", title, art, children, actions, onClose, layout = "auto", contained = false, interactive = true, class: className }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const desktop = useDesktop();
  const sheet = layout === "sheet" || (layout === "auto" && !desktop);

  useEffect(() => {
    if (!open || !interactive) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      // Safe default focus: the recommended action, or "Mejor no" (the last one) for an alertdialog.
      const buttons = Array.from(dialog.querySelectorAll<HTMLElement>(".mp-dialog__actions button, .mp-dialog__actions a[href]"));
      const target = (role === "alertdialog" ? buttons[buttons.length - 1] : buttons[0]) ?? dialog.querySelector<HTMLElement>(TABBABLE);
      target?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(TABBABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open, interactive, role]);

  if (!open) return null;

  const frame = `position:${contained ? "absolute" : "fixed"};inset:0;z-index:var(--z-modal);display:flex;justify-content:center;align-items:${sheet ? "flex-end" : "center"}`;

  return (
    <div style={frame}>
      <div class="mp-scrim" aria-hidden="true" onClick={role === "alertdialog" || !interactive ? undefined : onClose} />
      <div ref={dialogRef} class={cx("mp-dialog", sheet && "mp-dialog--sheet", className)} role={role} aria-modal="true" aria-labelledby={titleId}>
        {sheet && <button type="button" class="mp-sheet__grab" aria-label="Cerrar" onClick={onClose} />}
        <h2 class="mp-dialog__title" id={titleId}>
          {title}
        </h2>
        {art && <div class="mp-dialog__art">{art}</div>}
        {children && <p class="mp-dialog__body">{children}</p>}
        <div class="mp-dialog__actions">{actions}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ComponentChildren;
  confirmLabel: string;
  /** The way out. */
  cancelLabel?: string;
  /** Destructive: the confirm button is `mp-btn--danger` (with a trash icon unless `icon` says otherwise). */
  danger?: boolean;
  icon?: IconName;
  onConfirm: () => void;
  onCancel: () => void;
  layout?: DialogLayout;
  contained?: boolean;
  interactive?: boolean;
}

/** `alertdialog` with the recommended action first and "Mejor no" as the way out. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = "Mejor no", danger = false, icon, onConfirm, onCancel, layout, contained, interactive }: ConfirmDialogProps) {
  const iconName = icon ?? (danger ? "trash" : undefined);
  return (
    <Dialog
      open={open}
      role="alertdialog"
      title={title}
      onClose={onCancel}
      layout={layout}
      contained={contained}
      interactive={interactive}
      actions={
        <>
          <button type="button" class={cx("mp-btn", danger ? "mp-btn--danger" : "mp-btn--primary")} onClick={onConfirm}>
            {iconName && <Icon name={iconName} />}
            {confirmLabel}
          </button>
          <button type="button" class="mp-btn mp-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}
