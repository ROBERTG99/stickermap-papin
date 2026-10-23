import { signal } from "@preact/signals";

/** Tiny history-API router: the current path as a signal, `navigate()` and click interception for same-origin links. */
export const path = signal(location.pathname + location.search);

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (to === path.value) return;
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  path.value = to;
  window.scrollTo(0, 0);
}

addEventListener("popstate", () => { path.value = location.pathname + location.search; });

/** Let `<a href="/x">` navigate without a page load. Links opting out use target, download or data-external. */
addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || a.target || a.hasAttribute("download") || a.hasAttribute("data-external")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});

/** Match `/s/:id`-style patterns; returns params or null. */
export function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("?")[0]!.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const part = p[i]!;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(s[i]!);
    else if (part !== s[i]) return null;
  }
  return params;
}
