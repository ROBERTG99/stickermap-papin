/** Invisible Turnstile (BUILD.md §9): one token per single add, one per batch. */
declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      execute(widget: string): void;
      reset(widget: string): void;
      remove(widget: string): void;
    };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile script blocked or offline")); };
    document.head.append(s);
  });
  return loading;
}

/** Resolve a fresh token. Rejects when the challenge fails or the script cannot load (offline). */
export async function getTurnstileToken(sitekey: string): Promise<string> {
  await loadScript();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:var(--z-modal)";
  document.body.append(host);
  return new Promise<string>((resolve, reject) => {
    const cleanup = (id: string) => { window.turnstile?.remove(id); host.remove(); };
    const id = window.turnstile!.render(host, {
      sitekey,
      size: "flexible",
      appearance: "interaction-only",
      execution: "execute",
      callback: (token: string) => { cleanup(id); resolve(token); },
      "error-callback": () => { cleanup(id); reject(new Error("turnstile failed")); },
      "timeout-callback": () => { cleanup(id); reject(new Error("turnstile timeout")); },
    });
    window.turnstile!.execute(id);
  });
}
