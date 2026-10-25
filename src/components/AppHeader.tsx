import type { ComponentChildren } from "preact";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { CountBadge } from "./Badge";
import { Icon } from "./Icon";
import { visibleTabs, type NavTabId } from "./TabBar";

interface LogoProps {
  /** Show the tagline under the name (desktop). */
  tagline?: boolean;
}

/** Potato sticker + "Mapa Papin", links home. */
export function Logo({ tagline }: LogoProps) {
  return (
    <a class="mp-logo" href="/" aria-label={t("components.header.logoLabel")}>
      <span class="mp-sticker mp-sticker--contain" style={{ "--tilt": "var(--tilt-1)" }}>
        <img src="/img/icons/papa.png" alt="" />
      </span>
      {tagline ? (
        <span>
          Mapa Papin
          <small>{t("common.app.tagline")}</small>
        </span>
      ) : (
        "Mapa Papin"
      )}
    </a>
  );
}

interface PlaceSearchProps {
  value?: string;
  onInput?: (value: string) => void;
}

/** Compact place search field (default for the header's search slot). */
export function PlaceSearch({ value, onInput }: PlaceSearchProps) {
  return (
    <label class="mp-search mp-search--compact">
      <Icon name="search" />
      <input
        class="mp-input"
        type="search"
        placeholder={t("components.header.searchPlace")}
        aria-label={t("components.header.searchPlace")}
        value={value}
        onInput={(e) => onInput?.(e.currentTarget.value)}
      />
    </label>
  );
}

function filtersLabel(count: number): string {
  if (count <= 0) return t("components.header.filters");
  return t(count === 1 ? "components.header.filtersOne" : "components.header.filtersMany", { count });
}

interface FiltersButtonProps {
  /** Number of active filters; the count badge shows when above 0. */
  count: number;
  onClick?: () => void;
}

/** Filter button with the active-filter count. */
export function FiltersButton({ count, onClick }: FiltersButtonProps) {
  return (
    <button type="button" class="mp-btn mp-btn--secondary mp-btn--icon mp-filterbtn" aria-label={filtersLabel(count)} onClick={onClick}>
      <Icon name="filter" />
      {count > 0 && <CountBadge count={count} />}
    </button>
  );
}

/** Default menu button (language ES/EN, theme). Replace via the header's `menu` slot. */
export function MenuButton({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("components.header.menu")} onClick={onClick}>
      <Icon name="menu" />
    </button>
  );
}

interface CommonProps {
  class?: string;
}

interface FloatingProps extends CommonProps {
  variant: "floating";
  /** Slot for the place search; defaults to <PlaceSearch />. */
  search?: ComponentChildren;
  filterCount?: number;
  onFilters?: () => void;
  /** Slot for the menu; defaults to <MenuButton />. */
  menu?: ComponentChildren;
}

interface BarProps extends CommonProps {
  variant: "bar";
  title: string;
  onClose?: () => void;
  onHelp?: () => void;
}

interface DesktopProps extends CommonProps {
  variant: "desktop";
  active: NavTabId;
  search?: ComponentChildren;
  filterCount?: number;
  onFilters?: () => void;
  /** Where "+ Agregar sticker" goes (default /nuevo). */
  addHref?: string;
  menu?: ComponentChildren;
}

export type AppHeaderProps = FloatingProps | BarProps | DesktopProps;

/**
 * The app's top chrome.
 * - `floating`: mobile map card (logo + menu, search + filters). Position it from the parent.
 * - `bar`: flat bar for other mobile screens (close on the left, centred title).
 * - `desktop`: 64px top nav (logo + tagline, tabs, search, filters, "+ Agregar sticker", menu).
 */
export function AppHeader(props: AppHeaderProps) {
  if (props.variant === "bar") {
    return (
      <header class={cx("mp-appbar mp-appbar--bar", props.class)}>
        <div class="mp-appbar__row">
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("common.action.close")} onClick={props.onClose}>
            <Icon name="x" />
          </button>
          <h1 class="mp-appbar__title">{props.title}</h1>
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("components.header.help")} onClick={props.onHelp}>
            <Icon name="info" />
          </button>
        </div>
      </header>
    );
  }

  const search = props.search ?? <PlaceSearch />;
  const menu = props.menu ?? <MenuButton />;
  const filters = <FiltersButton count={props.filterCount ?? 0} onClick={props.onFilters} />;

  if (props.variant === "floating") {
    return (
      <header class={cx("mp-appbar", props.class)}>
        <div class="mp-appbar__row">
          <Logo />
          <span style={{ flex: 1 }} />
          {menu}
        </div>
        <div class="mp-appbar__row">
          {search}
          {filters}
        </div>
      </header>
    );
  }

  return (
    <header class={cx("mp-topnav", props.class)}>
      <Logo tagline />
      <nav class="mp-topnav__tabs" aria-label={t("components.header.sections")}>
        {visibleTabs().map((tab) => (
          <a key={tab.id} class="mp-topnav__tab" href={tab.href} aria-current={tab.id === props.active ? "page" : undefined}>
            <Icon name={tab.icon} />
            {tab.label}
          </a>
        ))}
      </nav>
      <div class="mp-topnav__end">
        {search}
        {filters}
        <a class="mp-btn mp-btn--primary" href={props.addHref ?? "/nuevo"}>
          <Icon name="plus" />
          {t("common.nav.add")}
        </a>
        {menu}
      </div>
    </header>
  );
}
