import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";

interface SidePanelProps {
  /** Accessible name (usually the place). */
  title: string;
  onClose: () => void;
  /** Arrow keys move to the previous / next spot in the current filter. */
  onPrev?: () => void;
  onNext?: () => void;
  children: ComponentChildren;
  /**
   * Pin it to the right, 400px wide, inset `space-4` below the top nav (desktop app).
   * Turn off to place it yourself (kitchen sink, tests).
   */
  floating?: boolean;
  class?: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Desktop container for the selected spot. Call `map.setPadding({ right: 432 })` while it is open. */
export function SidePanel({ title, onClose, onPrev, onNext, children, floating = true, class: className }: SidePanelProps) {
  const handlers = useRef({ onClose, onPrev, onNext });
  handlers.current = { onClose, onPrev, onNext };

  // Esc deselects, arrows walk the filtered spots. Dialogs and the lightbox mark their keys as handled.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") handlers.current.onClose();
      else if (e.key === "ArrowLeft" && handlers.current.onPrev) handlers.current.onPrev();
      else if (e.key === "ArrowRight" && handlers.current.onNext) handlers.current.onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside
      class={cx("mp-panel", className)}
      aria-label={title}
      style={floating ? "position:absolute;top:calc(var(--topnav-h) + var(--space-4));right:var(--space-4);bottom:var(--space-4)" : undefined}
    >
      <div class="mp-panel__head">
        <span class="mp-badge mp-badge--brand">
          <Icon name="pin" />
          Spot
        </span>
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label="Cerrar" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div class="mp-panel__body">{children}</div>
    </aside>
  );
}
