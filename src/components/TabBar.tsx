import type { IconName } from "./Icon";
import { Icon } from "./Icon";
import { cx } from "../lib/cx";

export type NavTabId = "map" | "gallery" | "stats";

export interface NavTab {
  id: NavTabId;
  label: string;
  href: string;
  icon: IconName;
}

/** Top-level destinations shared by the mobile tab bar and the desktop top nav. Admin lives at /admin, not here. */
export const NAV_TABS: readonly NavTab[] = [
  { id: "map", label: "Mapa", href: "/", icon: "map" },
  { id: "gallery", label: "Galería", href: "/galeria", icon: "gallery" },
  { id: "stats", label: "Stats", href: "/stats", icon: "stats" },
];

interface TabBarProps {
  active: NavTabId;
  class?: string;
}

/** Mobile top-level navigation: icon + label, the current tab gets a filled pill and a bolder label. */
export function TabBar({ active, class: className }: TabBarProps) {
  return (
    <nav class={cx("mp-tabbar", className)} aria-label="Secciones">
      {NAV_TABS.map((tab) => (
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
