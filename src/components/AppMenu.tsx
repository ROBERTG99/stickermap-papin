import { useEffect, useRef, useState } from "preact/hooks";
import { lang, setLang, t } from "../lib/i18n";
import { setTheme, theme, type ThemeChoice } from "../lib/store";
import { MenuButton } from "./AppHeader";
import { Segmented } from "./Segmented";

/** The header menu (language ES/EN and theme), a small popover under the menu button. */
export function AppMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("pointerdown", close);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", close); removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div class="menu" ref={root}>
      <MenuButton onClick={() => setOpen((o) => !o)} />
      {open && (
        <div class="menu__pop" role="dialog" aria-label={t("common.menu.title")}>
          <span class="mp-field__label" id="menu-lang">{t("common.menu.language")}</span>
          <Segmented
            labelledBy="menu-lang"
            value={lang.value}
            onChange={setLang}
            options={[{ value: "es", label: "ES" }, { value: "en", label: "EN" }]}
          />
          <span class="mp-field__label" id="menu-theme">{t("common.menu.theme")}</span>
          <Segmented<ThemeChoice>
            labelledBy="menu-theme"
            value={theme.value}
            onChange={setTheme}
            options={[
              { value: "auto", label: t("common.menu.system") },
              { value: "light", label: t("common.menu.light") },
              { value: "dark", label: t("common.menu.dark") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
