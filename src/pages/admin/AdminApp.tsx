import { lazy, Suspense } from "preact/compat";
import { useEffect } from "preact/hooks";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { auth, checkAuth, counts, loadAdminPeople, loadAdminTypes, refreshCounts } from "../../admin/state";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { match, path } from "../../lib/router";
import "./admin.css";

const ReviewPage = lazy(() => import("./ReviewPage"));
const DataPage = lazy(() => import("./DataPage"));
const TypesPage = lazy(() => import("./TypesPage"));
const PeoplePage = lazy(() => import("./PeoplePage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const SightingsPage = lazy(() => import("./SightingsPage"));

interface Section {
  id: "review" | "sightings" | "data" | "types" | "people" | "settings";
  href: string;
  icon: IconName;
  label: string;
}

const SECTIONS: readonly Section[] = [
  { id: "review", href: "/admin", icon: "inbox", label: "admin.nav.review" },
  { id: "sightings", href: "/admin/avistajes", icon: "eye", label: "admin.nav.sightings" },
  { id: "data", href: "/admin/datos", icon: "table", label: "admin.nav.data" },
  { id: "types", href: "/admin/tipos", icon: "tag", label: "admin.nav.types" },
  { id: "people", href: "/admin/personas", icon: "users", label: "admin.nav.people" },
  { id: "settings", href: "/admin/ajustes", icon: "settings", label: "admin.nav.settings" },
];

function currentSection(p: string): Section["id"] | null {
  if (match("/admin", p)) return "review";
  if (match("/admin/avistajes", p)) return "sightings";
  if (match("/admin/datos", p)) return "data";
  if (match("/admin/tipos", p)) return "types";
  if (match("/admin/personas", p)) return "people";
  if (match("/admin/ajustes", p)) return "settings";
  return null;
}

function Logo() {
  return (
    <a class="mp-logo mp-admin-logo" href="/" aria-label={t("admin.nav.logoLabel")}>
      <span class="mp-sticker mp-sticker--contain" style="--s:30px;--tilt:var(--tilt-1)">
        <img src="/img/icons/papa.png" alt="" />
      </span>
      <span>
        {t("common.app.name")}
        <small>{t("admin.nav.admin")}</small>
      </span>
    </a>
  );
}

function Sidebar({ active }: { active: Section["id"] | null }) {
  const c = counts.value;
  return (
    <nav class="mp-side" aria-label={t("admin.nav.label")}>
      <Logo />
      <div class="mp-side__items">
        {SECTIONS.map((s) => (
          <a key={s.id} class="mp-side__item" href={s.href} aria-current={active === s.id ? "page" : undefined}>
            <Icon name={s.icon} />
            <span class="mp-side__label">{t(s.label)}</span>
            {s.id === "review" && c.queue !== null && c.queue > 0 && <span class="mp-badge mp-badge--solid">{c.queue}</span>}
            {s.id === "sightings" && c.sightings !== null && c.sightings > 0 && <span class="mp-badge mp-badge--solid">{c.sightings}</span>}
            {s.id === "data" && c.total !== null && <span class="mp-badge">{c.total}</span>}
          </a>
        ))}
      </div>
      <div class="mp-side__foot">
        <span class="mp-field__hint mp-admin-who" title={auth.value.email ?? undefined}>
          <Icon name="lock" size="sm" />
          <span>
            <span class="mp-admin-who__email">{auth.value.email}</span>
            <span class="mp-admin-who__via">{t("admin.nav.access")}</span>
          </span>
        </span>
        <a class="mp-side__item" href="/">
          <Icon name="map" />
          <span class="mp-side__label">{t("admin.nav.map")}</span>
        </a>
      </div>
    </nav>
  );
}

/** Page10Admin 9a: shown when the Access cookie is missing or the email is not on the allowlist. */
function Login({ offline }: { offline: boolean }) {
  return (
    <main class="mp-admin-login">
      <div class="mp-dialog mp-admin-login__card">
        <div class="mp-admin-login__brand">
          <span class="mp-sticker mp-sticker--contain" style="--s:48px;--tilt:var(--tilt-1)">
            <img src="/img/icons/papa.png" alt="" />
          </span>
          <div>
            <h1 class="mp-admin-login__title">{t("admin.login.title")}</h1>
            <span class="mp-field__hint">{t("admin.login.hint")}</span>
          </div>
        </div>
        <p class="mp-dialog__body" role={offline ? "status" : undefined}>
          {offline ? t("admin.login.offline") : t("admin.login.denied")}
        </p>
        <Button variant="primary" block icon={offline ? "rotate" : "mail"} onClick={() => (offline ? void checkAuth() : location.reload())}>
          {offline ? t("common.action.retry") : t("admin.login.cta")}
        </Button>
        <span class="mp-turnstile mp-admin-login__note">
          <Icon name="shield" />
          {t("admin.login.note")}
        </span>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <div class="mp-admin-pad" aria-busy="true">
      <Skeleton variant="line" width="30%" />
      <Skeleton height={240} radius={16} />
    </div>
  );
}

function Body({ section }: { section: Section["id"] | null }) {
  switch (section) {
    case "review":
      return <ReviewPage />;
    case "sightings":
      return <SightingsPage />;
    case "data":
      return <DataPage />;
    case "types":
      return <TypesPage />;
    case "people":
      return <PeoplePage />;
    case "settings":
      return <SettingsPage />;
    default:
      return (
        <div class="mp-admin-pad">
          <h1 class="mp-title">{t("admin.notFound.title")}</h1>
          <p>{t("admin.notFound.body")}</p>
          <a class="mp-btn mp-btn--primary" href="/admin">
            {t("admin.notFound.cta")}
          </a>
        </div>
      );
  }
}

export default function AdminApp() {
  const { state } = auth.value;
  useEffect(() => {
    document.title = `${t("admin.nav.admin")} · ${t("common.app.name")}`;
    void checkAuth();
  }, []);
  useEffect(() => {
    if (state !== "ok") return;
    void refreshCounts();
    void loadAdminTypes();
    void loadAdminPeople();
  }, [state]);

  if (state === "loading") return <Loading />;
  if (state !== "ok") return <Login offline={state === "offline"} />;

  const section = currentSection(path.value);
  return (
    <div class={cx("mp-admin", "mp-admin--app")}>
      <Sidebar active={section} />
      <main class="mp-admin__main">
        <Suspense fallback={<Loading />}>
          <Body key={section ?? "none"} section={section} />
        </Suspense>
      </main>
    </div>
  );
}
