import type { ComponentChildren } from "preact";
import { AppHeader } from "./AppHeader";
import { TabBar, type NavTabId } from "./TabBar";
import { isDesktop } from "../lib/media";
import { t } from "../lib/i18n";

interface ShellProps {
  active: NavTabId;
  children: ComponentChildren;
  /** Place search / filters for the desktop nav (the map page supplies them). */
  search?: ComponentChildren;
  filterCount?: number;
  onFilters?: () => void;
  menu?: ComponentChildren;
  /** Mobile header; each page decides (the map uses the floating card). Desktop always gets the 64px top nav. */
  mobileHeader?: ComponentChildren;
  /** Show the "+ Agregar sticker" FAB on mobile (desktop has the button in the nav). */
  fab?: boolean;
}

/**
 * Top-level screens (Mapa, Galería, Stats, Perfil): desktop = top nav + content; mobile = content + tab bar + FAB.
 * Content fills the remaining height, so the map can be full-bleed.
 */
export function Shell({ active, children, search, filterCount, onFilters, menu, mobileHeader, fab = true }: ShellProps) {
  const desktop = isDesktop.value;
  return (
    <div class="shell" data-layout={desktop ? "desktop" : "mobile"}>
      {desktop && <AppHeader variant="desktop" active={active} search={search} filterCount={filterCount} onFilters={onFilters} menu={menu} />}
      <main class="shell__main">
        {!desktop && mobileHeader}
        {children}
        {!desktop && fab && (
          <a class="mp-fab shell__fab" href="/nuevo">
            <span aria-hidden="true">+</span> {t("nav.add")}
          </a>
        )}
      </main>
      {!desktop && <TabBar active={active} />}
    </div>
  );
}
