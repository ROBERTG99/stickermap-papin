import type { ComponentChildren, TargetedPointerEvent, TargetedWheelEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { StickerType } from "../shared/types";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { Flag, TypeSticker, placersLabel, tiltByIndex } from "./map-parts";

/** One photo of the ordered list (nearby spots, sorted by distance from the one opened first). */
export interface LightboxItem {
  id: string;
  /** `/img/display/<id>.webp`; null shows the placeholder photo. */
  photo: string | null;
  place: string;
  countryCode: string | null;
  placers: string[];
  /** Already formatted ("14 sep 2024"). */
  date: string;
  types: StickerType[];
  /** Placeholder variant (`mp-photo--<variant>`) when there is no photo, e.g. "night". */
  placeholderVariant?: string;
}

interface LightboxProps {
  items: LightboxItem[];
  /** Controlled current index. */
  index: number;
  /** Swipe right / ArrowLeft. Not called at the first item. */
  onPrev?: () => void;
  /** Swipe left / ArrowRight. Not called at the last item. */
  onNext?: () => void;
  /** X, Esc or swipe down. The parent returns focus to the thumbnail. */
  onClose: () => void;
  onShare?: (item: LightboxItem) => void;
  /** Replaces the default place + "Pegado por" + types block of the caption. */
  caption?: ComponentChildren;
  /** Show "Pellizcá para hacer zoom" until the first zoom. */
  showHint?: boolean;
  /** Fired once, on the first zoom (so the app can remember it). */
  onFirstZoom?: () => void;
  /** Fill the nearest positioned ancestor instead of the viewport (framed previews). */
  contained?: boolean;
  /** Keyboard, focus trap and focus return. Off only for a visual specimen. */
  interactive?: boolean;
  class?: string;
}

interface Zoom {
  s: number;
  x: number;
  y: number;
}
interface Offset {
  x: number;
  y: number;
  animate: boolean;
}
interface Gesture {
  mode: "none" | "pan" | "swipe-x" | "swipe-y" | "pinch" | "ignore";
  startX: number;
  startY: number;
  startT: number;
  z0: Zoom;
  dist0: number;
  mid0: { x: number; y: number };
  moved: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
}

const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
const MOVE_THRESHOLD = 8;
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 0.5;
const CLOSE_DISTANCE = 100;
const SETTLE_MS = 200;
const TABBABLE = "button:not([disabled]), a[href]";
const IMG_STYLE = "width:100%;max-height:calc(100dvh - 240px);object-fit:contain;display:block";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function Media({ item, index, style, peek }: { item: LightboxItem; index: number; style?: string; peek?: boolean }) {
  const first = item.types[0];
  const alt = t("components.photo.alt", { type: first?.label ?? "sticker" });
  if (item.photo) {
    return <img src={item.photo} alt={peek ? "" : alt} draggable={false} style={`${IMG_STYLE};${style ?? ""}`} />;
  }
  return (
    <div
      class={cx("mp-photo", item.placeholderVariant && `mp-photo--${item.placeholderVariant}`)}
      style={`--ratio:4/5;--tilt:${tiltByIndex(index)};${style ?? ""}`}
      role={peek ? undefined : "img"}
      aria-label={peek ? undefined : alt}
    >
      {first && <TypeSticker type={first} />}
    </div>
  );
}

/** Which dots to draw: all of them up to 9 spots, else a window of 7 around the current one. */
function dotWindow(count: number, index: number): { start: number; end: number } {
  if (count <= 9) return { start: 0, end: count };
  const start = clamp(index - 3, 0, count - 7);
  return { start, end: start + 7 };
}

/** Full-screen photo viewer: swipe through nearby spots, pinch or double-tap to zoom, X / Esc / swipe down to close. */
export function Lightbox({ items, index, onPrev, onNext, onClose, onShare, caption, showHint = true, onFirstZoom, contained = false, interactive = true, class: className }: LightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomedOnce = useRef(false);

  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const zoomRef = useRef<Zoom>(NO_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0, animate: false });
  const [gesturing, setGesturing] = useState(false);
  const [hintHidden, setHintHidden] = useState(false);

  const count = items.length;
  const item = items[index];
  const hasPrev = index > 0 && !!onPrev;
  const hasNext = index < count - 1 && !!onNext;

  // Latest props for the window key handler.
  const live = useRef({ onClose, onPrev, onNext, hasPrev, hasNext });
  live.current = { onClose, onPrev, onNext, hasPrev, hasNext };

  const applyZoom = (z: Zoom) => {
    zoomRef.current = z;
    setZoom(z);
    if (z.s > 1.05 && !zoomedOnce.current) {
      zoomedOnce.current = true;
      setHintHidden(true);
      onFirstZoom?.();
    }
  };

  const clampZoom = (z: Zoom): Zoom => {
    const rect = stageRef.current?.getBoundingClientRect();
    const s = clamp(z.s, 1, MAX_ZOOM);
    if (!rect || s === 1) return { s, x: 0, y: 0 };
    return { s, x: clamp(z.x, (-(s - 1) * rect.width) / 2, ((s - 1) * rect.width) / 2), y: clamp(z.y, (-(s - 1) * rect.height) / 2, ((s - 1) * rect.height) / 2) };
  };

  // A new photo starts un-zoomed and centred.
  useEffect(() => {
    zoomRef.current = NO_ZOOM;
    setZoom(NO_ZOOM);
    setOffset({ x: 0, y: 0, animate: false });
  }, [index]);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  // Keyboard, focus in, focus back out.
  useEffect(() => {
    if (!interactive) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const l = live.current;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        l.onClose();
      } else if (e.key === "ArrowLeft" && l.hasPrev) {
        e.preventDefault();
        e.stopImmediatePropagation();
        l.onPrev?.();
      } else if (e.key === "ArrowRight" && l.hasNext) {
        e.preventDefault();
        e.stopImmediatePropagation();
        l.onNext?.();
      } else if (e.key === "Tab" && rootRef.current) {
        const focusables = Array.from(rootRef.current.querySelectorAll<HTMLElement>(TABBABLE));
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (!firstEl || !lastEl) return;
        const active = document.activeElement;
        if (!rootRef.current.contains(active) || (e.shiftKey && active === firstEl)) {
          e.preventDefault();
          (e.shiftKey ? lastEl : firstEl).focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [interactive]);

  if (!item) return null;

  const stageCenter = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width } : { x: 0, y: 0, w: 0 };
  };

  const settle = (x: number, y: number, then?: () => void) => {
    setOffset({ x, y, animate: true });
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      setOffset({ x: 0, y: 0, animate: false });
      then?.();
    }, SETTLE_MS);
  };

  const toggleZoomAt = (px: number, py: number) => {
    if (zoomRef.current.s > 1) {
      applyZoom(NO_ZOOM);
      return;
    }
    const c = stageCenter();
    applyZoom(clampZoom({ s: DOUBLE_TAP_ZOOM, x: (c.x - px) * (DOUBLE_TAP_ZOOM - 1), y: (c.y - py) * (DOUBLE_TAP_ZOOM - 1) }));
  };

  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (settleTimer.current) return; // mid-settle: ignore
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const base = { startX: e.clientX, startY: e.clientY, startT: e.timeStamp, z0: zoomRef.current, moved: false, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, vx: 0, vy: 0 };
    if (pointers.current.size === 1) {
      gesture.current = { ...base, mode: "none", dist0: 0, mid0: { x: e.clientX, y: e.clientY } };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      if (a && b) {
        gesture.current = { ...base, mode: "pinch", z0: zoomRef.current, dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        setGesturing(true);
        setOffset({ x: 0, y: 0, animate: false });
      }
    }
  };

  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === "pinch") {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const c = stageCenter();
      const s = clamp(g.z0.s * (dist / g.dist0), 1, MAX_ZOOM);
      // Keep the content point that started under the fingers under the fingers.
      const ux = (g.mid0.x - c.x - g.z0.x) / g.z0.s;
      const uy = (g.mid0.y - c.y - g.z0.y) / g.z0.s;
      applyZoom(clampZoom({ s, x: mid.x - c.x - s * ux, y: mid.y - c.y - s * uy }));
      return;
    }
    if (g.mode === "ignore" || pointers.current.size !== 1) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) {
      g.vx = (e.clientX - g.lastX) / dt;
      g.vy = (e.clientY - g.lastY) / dt;
    }
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
      g.moved = true;
      setGesturing(true);
    }

    if (zoomRef.current.s > 1) {
      g.mode = "pan";
      applyZoom(clampZoom({ s: zoomRef.current.s, x: g.z0.x + dx, y: g.z0.y + dy }));
      return;
    }
    if (g.mode === "none") g.mode = Math.abs(dx) >= Math.abs(dy) ? "swipe-x" : "swipe-y";
    if (g.mode === "swipe-x") {
      const blocked = (dx > 0 && !hasPrev) || (dx < 0 && !hasNext);
      setOffset({ x: blocked ? dx * 0.25 : dx, y: 0, animate: false });
    } else if (g.mode === "swipe-y") {
      setOffset({ x: 0, y: Math.max(0, dy), animate: false });
    }
  };

  const endPointer = (e: TargetedPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;

    if (g.mode === "pinch") {
      if (pointers.current.size === 0) {
        if (zoomRef.current.s < 1.05) applyZoom(NO_ZOOM);
        gesture.current = null;
        setGesturing(false);
      } else {
        g.mode = "ignore";
      }
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    setGesturing(false);
    if (cancelled) {
      setOffset({ x: 0, y: 0, animate: true });
      return;
    }

    if (!g.moved) {
      const last = lastTap.current;
      if (last && e.timeStamp - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        lastTap.current = null;
        toggleZoomAt(e.clientX, e.clientY);
      } else {
        lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      }
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.mode === "swipe-x") {
      const go = Math.abs(dx) > SWIPE_DISTANCE || Math.abs(g.vx) > SWIPE_VELOCITY;
      const w = stageCenter().w || 360;
      if (go && dx < 0 && hasNext) settle(-(w + 12), 0, onNext);
      else if (go && dx > 0 && hasPrev) settle(w + 12, 0, onPrev);
      else setOffset({ x: 0, y: 0, animate: true });
    } else if (g.mode === "swipe-y") {
      if (dy > CLOSE_DISTANCE || g.vy > 0.6) onClose();
      else setOffset({ x: 0, y: 0, animate: true });
    }
  };

  const onWheel = (e: TargetedWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const z = zoomRef.current;
    const s = clamp(z.s * (1 - e.deltaY * 0.002), 1, MAX_ZOOM);
    if (s === z.s) return;
    const c = stageCenter();
    const ux = (e.clientX - c.x - z.x) / z.s;
    const uy = (e.clientY - c.y - z.y) / z.s;
    applyZoom(clampZoom({ s, x: e.clientX - c.x - s * ux, y: e.clientY - c.y - s * uy }));
  };

  const prevItem = items[index - 1];
  const nextItem = items[index + 1];
  const zoomed = zoom.s > 1;
  const { start, end } = dotWindow(count, index);
  const stageStyle = `touch-action:none;transform:translate3d(${offset.x}px,${offset.y}px,0);transition:${offset.animate ? `transform ${SETTLE_MS}ms ease` : "none"}`;
  const mediaStyle = `transform:translate(${zoom.x}px,${zoom.y}px) scale(${zoom.s});transition:${gesturing ? "none" : "transform 160ms ease"};cursor:${zoomed ? "zoom-out" : "zoom-in"}`;
  const hintVisible = showHint && !hintHidden;

  return (
    <div
      ref={rootRef}
      class={cx("mp-lightbox", className)}
      role="dialog"
      aria-modal="true"
      aria-label={t("components.lightbox.label", { place: item.place, n: index + 1, count })}
      style={contained ? undefined : "position:fixed"}
    >
      <div class="mp-lightbox__top" style="padding-top:calc(env(safe-area-inset-top, 0px) + var(--space-4))">
        <button ref={closeBtnRef} type="button" class="mp-lightbox__btn" aria-label={t("common.action.close")} onClick={onClose}>
          <Icon name="x" />
        </button>
        <span class="mp-lightbox__count" aria-live="polite">{`${index + 1} / ${count}`}</span>
        {onShare ? (
          <button type="button" class="mp-lightbox__btn" aria-label={t("common.action.share")} onClick={() => onShare(item)}>
            <Icon name="share" />
          </button>
        ) : (
          <span aria-hidden="true" style="width:var(--tap-min)" />
        )}
      </div>

      <div
        ref={stageRef}
        class="mp-lightbox__stage"
        style={stageStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onWheel={onWheel}
      >
        {prevItem && (
          <div class="mp-lightbox__peek mp-lightbox__peek--prev" aria-hidden="true" style={zoomed ? "opacity:0" : undefined}>
            <Media item={prevItem} index={index - 1} peek />
          </div>
        )}
        {nextItem && (
          <div class="mp-lightbox__peek mp-lightbox__peek--next" aria-hidden="true" style={zoomed ? "opacity:0" : undefined}>
            <Media item={nextItem} index={index + 1} peek />
          </div>
        )}
        <Media item={item} index={index} style={mediaStyle} />
      </div>

      <div class="mp-lightbox__cap" style="padding-bottom:calc(env(safe-area-inset-bottom, 0px) + var(--space-5))">
        {hintVisible && (
          <span class="mp-lightbox__hint">
            <Icon name="expand" />
            {t("components.lightbox.pinch")}
          </span>
        )}
        {caption ?? (
          <>
            <span class="mp-lightbox__place">
              {item.place}
              {item.countryCode && <Flag code={item.countryCode} />}
            </span>
            <span class="mp-lightbox__meta">{`${t("components.photo.placedBy", { name: placersLabel(item.placers) })}${item.date ? ` · ${item.date}` : ""}`}</span>
            {item.types.length > 0 && (
              <span class="mp-lightbox__meta" style="display:flex;align-items:center;gap:var(--space-2)">
                {item.types.map((t) => (
                  <TypeSticker key={t.slug} type={t} />
                ))}
                {item.types.map((t) => t.label).join(", ")}
              </span>
            )}
          </>
        )}
        {count > 1 && (
          <span class="mp-lightbox__dots" aria-hidden="true">
            {Array.from({ length: end - start }, (_, i) => (
              <i key={start + i} class={start + i === index ? "is-on" : undefined} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
