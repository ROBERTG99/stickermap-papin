import { useEffect, useId, useRef, useState } from "preact/hooks";
import { MenuButton } from "../../components/AppHeader";
import { Segmented } from "../../components/Segmented";
import { lang, setLang, t } from "../../lib/i18n";
import { setTheme, theme, type ThemeChoice } from "../../lib/store";
import type { Lang } from "../../shared/types";

/** The menu button: a small popover with language (ES / EN) and theme (automatic / light / dark). */
export function MapMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const langId = useId();
  const themeId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div class="map-menu" ref={rootRef}>
      <MenuButton onClick={() => setOpen((v) => !v)} />
      {open && (
        <div class="map-menu__pop" role="dialog" aria-label={t("map.menu.title")}>
          <div class="mp-field">
            <span class="mp-field__label" id={langId}>{t("menu.language")}</span>
            <Segmented<Lang>
              labelledBy={langId}
              value={lang.value}
              onChange={setLang}
              options={[
                { value: "es", label: "ES" },
                { value: "en", label: "EN" },
              ]}
            />
          </div>
          <div class="mp-field">
            <span class="mp-field__label" id={themeId}>{t("menu.theme")}</span>
            <Segmented<ThemeChoice>
              labelledBy={themeId}
              value={theme.value}
              onChange={setTheme}
              options={[
                { value: "auto", label: t("menu.system") },
                { value: "light", label: t("menu.light") },
                { value: "dark", label: t("menu.dark") },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
