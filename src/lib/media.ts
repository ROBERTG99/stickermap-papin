import { signal } from "@preact/signals";

/** Reactive `matchMedia` for non-hook code; components read `.value`. */
export function mediaSignal(query: string) {
  const mq = matchMedia(query);
  const s = signal(mq.matches);
  mq.addEventListener("change", (e) => { s.value = e.matches; });
  return s;
}

/** >= 900px: desktop layout (64px top nav, side panel, drawer); below: mobile (tab bar, sheet). */
export const isDesktop = mediaSignal("(min-width: 900px)");
export const prefersReducedMotion = mediaSignal("(prefers-reduced-motion: reduce)");
