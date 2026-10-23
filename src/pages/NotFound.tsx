import { t } from "../lib/i18n";

export default function NotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: "var(--space-4)", textAlign: "center" }}>
      <div>
        <h1 class="t-display">{t("empty.notFound")}</h1>
        <p><a class="mp-btn mp-btn--primary" href="/">{t("nav.map")}</a></p>
      </div>
    </main>
  );
}
