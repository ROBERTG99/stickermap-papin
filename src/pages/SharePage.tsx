import { useEffect } from "preact/hooks";
import { Banner } from "../components/Banner";
import { pendingFiles } from "../lib/handoff";
import { t } from "../lib/i18n";
import { navigate } from "../lib/router";

/**
 * Android share target (`POST /compartir`, handled by sw.js, which stores the received files in the `mp-share` cache).
 * One file opens the single add flow, several open the bulk add (BUILD.md §7.3b).
 */
export default function SharePage() {
  useEffect(() => {
    void (async () => {
      const files: File[] = [];
      try {
        const cache = await caches.open("mp-share");
        for (const request of await cache.keys()) {
          const res = await cache.match(request);
          if (!res) continue;
          const blob = await res.blob();
          files.push(new File([blob], decodeURIComponent(res.headers.get("X-Name") ?? "foto"), { type: blob.type }));
          await cache.delete(request);
        }
      } catch {
        /* Cache API unavailable: fall through to the empty add screen */
      }
      pendingFiles.value = files;
      navigate(files.length > 1 ? "/nuevo/varias" : "/nuevo", { replace: true });
    })();
  }, []);
  return (
    <main style={{ padding: "var(--space-4)" }}>
      <Banner kind="info">{t("share.received")}</Banner>
    </main>
  );
}
