import type { IconName } from "./Icon";
import { Icon } from "./Icon";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { config } from "../lib/store";

export type NavTabId = "map" | "gallery" | "near" | "stats";

export interface NavTab {
  id: NavTabId;
  label: string;
  href: string;
  icon: IconName;
}

/** Top-level destinations shared by the mobile tab bar and the desktop top nav. Admin lives at /admin, not here. */
export const NAV_TABS: readonly NavTab[] = [
  {
    id: "map",
    get label() {
      return t("common.nav.map");
    },
    href: "/",
    icon: "map",
  },
  {
    id: "gallery",
    get label() {
      return t("common.nav.gallery");
    },
    href: "/galeria",
    icon: "gallery",
  },
  {
    id: "near",
    get label() {
      return t("common.nav.near");
    },
    href: "/cerca",
    icon: "compass",
  },
  {
    id: "stats",
    get label() {
      return t("common.nav.stats");
    },
    href: "/stats",
    icon: "stats",
  },
];

/** The tabs to show: "Cerca" only while the sightings feature is on. */
export const visibleTabs = (): readonly NavTab[] => NAV_TABS.filter((tab) => tab.id !== "near" || config.value?.features.sightings === true);

interface TabBarProps {
  active: NavTabId;
  class?: string;
}

/** Mobile top-level navigation: icon + label, the current tab gets a filled pill and a bolder label. */
export function TabBar({ active, class: className }: TabBarProps) {
  return (
    <nav class={cx("mp-tabbar", className)} aria-label={t("components.header.sections")}>
      {visibleTabs().map((tab) => (
        <a key={tab.id} class="mp-tabbar__tab" href={tab.href} aria-current={tab.id === active ? "page" : undefined}>
          <span class="mp-tabbar__pill">
            <Icon name={tab.icon} />
          </span>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
