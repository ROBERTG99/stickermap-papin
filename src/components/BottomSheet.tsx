import type { ComponentChildren, TargetedKeyboardEvent, TargetedMouseEvent, TargetedPointerEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";

export type SheetSnap = "peek" | "expanded";

interface BottomSheetProps {
  open: boolean;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Drag down from peek, or (modal) scrim tap / Esc. The parent sets `open` to false. */
  onClose: () => void;
  /** Accessible name when expanded (usually the place); the peeking region is "Sticker seleccionado". */
  title: string;
  children: ComponentChildren;
  /** Sit above the tab bar while peeking (mobile app). Turn off inside a plain container. */
  aboveTabBar?: boolean;
  /** Modal sheet (filters, confirm): adds `mp-scrim` behind and always acts as a dialog. */
  modal?: boolean;
  class?: string;
}

const EXPANDED_RATIO = 0.88;
const DRAG_THRESHOLD = 6;
const FLICK_PX_PER_MS = 0.5;
const SPRING = "280ms cubic-bezier(.2,.9,.3,1.3)";
const CLOSE_MS = 260;

interface DragState {
  pointerId: number;
  startY: number;
  startHeight: number;
  maxHeight: number;
  dragging: boolean;
  lastY: number;
  lastT: number;
  velocity: number;
  fromSnap: SheetSnap;
  total: number;
}

/**
 * Mobile container for a selected spot. Peek (176px, region) -> expanded (88%, dialog).
 * Drag or tap the handle to move between snaps; drag down from peek to close; Esc collapses.
 */
export function BottomSheet({ open, snap, onSnapChange, onClose, title, children, aboveTabBar = true, modal = false, class: className }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const prevSnapRef = useRef<SheetSnap>(snap);

  const [shown, setShown] = useState(open);
  const [entered, setEntered] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // Mount / unmount with a slide: `shown` keeps the node while it animates out.
  useEffect(() => {
    if (open) {
      setShown(true);
      setDragHeight(null);
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = setTimeout(() => {
      setShown(false);
      setDragHeight(null);
    }, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Focus moves in when expanded and goes back to where it came from when collapsed.
  useEffect(() => {
    const prev = prevSnapRef.current;
    prevSnapRef.current = snap;
    if (!shown) return;
    if (snap === "expanded" && prev !== "expanded") {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      grabRef.current?.focus();
    } else if (snap === "peek" && prev === "expanded") {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && target.isConnected) target.focus();
      else grabRef.current?.focus();
    }
  }, [snap, shown]);

  if (!shown) return null;

  const expanded = snap === "expanded";
  const role = expanded || modal ? "dialog" : "region";
  const label = expanded || modal ? title : t("components.sheet.selected");

  const toggleSnap = () => onSnapChange(expanded ? "peek" : "expanded");

  const onKeyDown = (e: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    if (modal) {
      e.stopPropagation();
      onClose();
    } else if (expanded) {
      e.stopPropagation();
      onSnapChange("peek");
    }
  };

  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const sheet = sheetRef.current;
    const grab = grabRef.current;
    if (!sheet || !grab) return;
    // Expanded: only the handle drags (the body scrolls). Peek: the whole sheet drags.
    if (expanded && !grab.contains(e.target as Node)) return;
    const parentHeight = sheet.parentElement?.clientHeight ?? window.innerHeight;
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: sheet.offsetHeight,
      maxHeight: parentHeight * EXPANDED_RATIO,
      dragging: false,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      fromSnap: snap,
      total: 0,
    };
  };

  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.dragging) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      d.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.total = dy;
    setDragHeight(Math.max(0, Math.min(d.maxHeight, d.startHeight - dy)));
  };

  const finishDrag = (e: TargetedPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.dragging) return;
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    const flickDown = d.velocity > FLICK_PX_PER_MS;
    const flickUp = d.velocity < -FLICK_PX_PER_MS;
    if (cancelled) {
      setDragHeight(null);
      return;
    }
    if (d.fromSnap === "peek") {
      if (d.total < -40 || flickUp) {
        setDragHeight(null);
        onSnapChange("expanded");
      } else if (d.total > 56 || flickDown) {
        onClose(); // keep the dragged height so it slides out from where the finger left it
      } else {
        setDragHeight(null);
      }
    } else if (d.total > 80 || flickDown) {
      setDragHeight(null);
      onSnapChange("peek");
    } else {
      setDragHeight(null);
    }
  };

  const onSheetClick = (e: TargetedMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) return;
    // Tapping the quiet part of a peeking sheet expands it; buttons and links keep their own job.
    if (!expanded && !modal && !(e.target as HTMLElement).closest("button, a")) onSnapChange("expanded");
  };

  const dragging = dragHeight !== null;
  const heightStyle = dragging ? `${dragHeight}px` : expanded ? `${EXPANDED_RATIO * 100}%` : null;
  const bottom = !expanded && !modal && aboveTabBar ? "var(--tabbar-h)" : "0px";
  const slide = entered ? "translateY(0)" : "translateY(100%)";
  const style = [
    heightStyle ? `height:${heightStyle}` : "",
    `bottom:${bottom}`,
    `transform:${slide}`,
    dragging ? "transition:none" : `transition:height ${SPRING},bottom ${SPRING},transform ${SPRING}`,
    !expanded ? "touch-action:none" : "",
  ]
    .filter(Boolean)
    .join(";");

  return (
    <>
      {modal && <div class="mp-scrim" onClick={onClose} aria-hidden="true" />}
      <div
        ref={sheetRef}
        class={cx("mp-sheet", !expanded && !modal && "mp-sheet--peek", modal && "mp-sheet--modal", className)}
        role={role}
        aria-label={label}
        aria-modal={modal ? "true" : undefined}
        style={style}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishDrag(e, false)}
        onPointerCancel={(e) => finishDrag(e, true)}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onClick={onSheetClick}
      >
        <button ref={grabRef} type="button" class="mp-sheet__grab" aria-label={expanded ? t("components.sheet.collapse") : t("components.sheet.expand")} style="touch-action:none" onClick={toggleSnap} />
        <div style="flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain">{children}</div>
      </div>
    </>
  );
}
