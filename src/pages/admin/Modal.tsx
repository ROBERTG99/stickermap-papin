import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Right-aligned buttons under the content (primary first on mobile, last on desktop is not used: the primary comes first). */
  actions: ComponentChildren;
  /** 640px two-column modal of the design (new type) instead of the 480px default. */
  wide?: boolean;
  /** Keep the scrim from closing the modal (forms with unsaved text). */
  sticky?: boolean;
}

/**
 * Form modal of the admin: centred card on desktop, bottom sheet on mobile, like `Dialog`, but its body can be any form
 * (`Dialog` only takes a paragraph). Traps focus, Esc closes, focus returns to the trigger.
 */
export function Modal({ open, title, onClose, children, actions, wide, sticky }: ModalProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const sheet = !isDesktop.value;

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(TABBABLE));
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) return;
      const active = document.activeElement;
      if (!ref.current.contains(active)) {
        e.preventDefault();
        head.focus();
      } else if (e.shiftKey && active === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && active === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div class="mp-admin-modal" style={{ alignItems: sheet ? "flex-end" : "center" }}>
      <div class="mp-scrim" aria-hidden="true" onClick={sticky ? undefined : onClose} />
      <div ref={ref} class={cx("mp-dialog", "mp-admin-modal__card", sheet && "mp-dialog--sheet", wide && "mp-admin-modal__card--wide")} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {sheet && <button type="button" class="mp-sheet__grab" aria-label={t("action.close")} onClick={onClose} />}
        <h2 class="mp-dialog__title" id={titleId}>
          {title}
        </h2>
        <div class="mp-admin-modal__body">{children}</div>
        <div class="mp-admin-modal__actions">{actions}</div>
      </div>
    </div>
  );
}
