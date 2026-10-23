import { useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { canInstall, dismissInstall, promptInstall, shouldOfferInstall } from "../lib/pwa";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";

/** "Instalá Mapa Papin" sheet (design Page13System 10c): offered from the 2nd sticker on, never on the first visit. */
export function InstallSheet() {
  const [closed, setClosed] = useState(false);
  const open = !closed && canInstall.value && shouldOfferInstall();
  const close = () => { dismissInstall(); setClosed(true); };
  return (
    <Dialog
      open={open}
      layout="sheet"
      title={t("install.title")}
      onClose={close}
      art={
        <>
          <span class="mp-sticker mp-sticker--contain" style={{ "--s": "44px" }}><img src="/img/icons/papa.png" alt="" /></span>
          <div><span class="mp-field__hint">{t("install.hint")}</span></div>
        </>
      }
      actions={
        <>
          <button type="button" class="mp-btn mp-btn--primary mp-btn--block" onClick={() => { void promptInstall().then(() => setClosed(true)); }}>{t("install.accept")}</button>
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--block" onClick={close}>{t("install.later")}</button>
        </>
      }
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
        {([["map", "install.map"], ["share", "install.share"], ["wifi-off", "install.offline"]] as const).map(([icon, key]) => (
          <li key={key} style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--ink-strong)", fontWeight: 600 }}>
            <Icon name={icon} />{t(key)}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
