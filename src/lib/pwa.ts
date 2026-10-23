/** Service worker registration + the "Instalá Mapa Papin" prompt (design Page13System 10c). */
import { signal } from "@preact/signals";
import { storage } from "./local";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
export const canInstall = signal(false);

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      const active = reg?.active ?? reg?.installing ?? reg?.waiting;
      void navigator.serviceWorker.ready.then((r) => r.active?.postMessage("warm-shell"));
      return active;
    });
  });
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    canInstall.value = true;
  });
  addEventListener("appinstalled", () => { deferred = null; canInstall.value = false; });
}

/** Call after a successful submit. The install sheet shows from the 2nd sticker on, never on the first visit. */
export function recordStickerAdded(count = 1): void {
  storage.set("stickersAdded", storage.get<number>("stickersAdded", 0) + count);
}

export const shouldOfferInstall = () => canInstall.value && storage.get<number>("stickersAdded", 0) >= 2 && !storage.get<boolean>("installDismissed", false);

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  canInstall.value = false;
  return outcome === "accepted";
}

export function dismissInstall(): void {
  storage.set("installDismissed", true);
}
