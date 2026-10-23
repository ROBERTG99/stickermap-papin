import { useState } from "preact/hooks";
import { AppHeader } from "../components/AppHeader";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { DuplicateDialog } from "../add/DuplicateDialog";
import { AddSubmitBar, type AddSubmitState } from "../add/AddSubmitBar";
import { DesktopMap, LocationCard } from "../add/LocationCard";
import { PhotoCard } from "../add/PhotoCard";
import { AddStyles } from "../add/styles";
import { WhatCard } from "../add/WhatCard";
import { useAddForm } from "../add/useAddForm";
import type { IssueCode } from "../add/logic";
import { lang, t } from "../lib/i18n";
import { isDesktop, prefersReducedMotion } from "../lib/media";
import { navigate } from "../lib/router";

function missingText(codes: readonly IssueCode[]): string {
  const names = [...new Set(codes)].map((code) => t(`add.missing.${code}`));
  return new Intl.ListFormat(lang.value, { style: "long", type: "conjunction" }).format(names);
}

function scrollToCard(card: number): void {
  document.getElementById(`add-card-${card}`)?.scrollIntoView({ behavior: prefersReducedMotion.value ? "auto" : "smooth", block: "center" });
}

/** `/nuevo`: one scrollable page, three numbered cards, a sticky "Mandale Mecha" bar (BUILD.md §7.3). */
export default function AddPage() {
  const form = useAddForm();
  const { s, issues, actions } = form;
  const desktop = isDesktop.value;
  const [help, setHelp] = useState(false);

  const uploading = s.phase === "uploading";
  const state: AddSubmitState = uploading ? "uploading" : issues.length ? "disabled" : s.phase === "failed" ? "failed" : "ready";

  const onSubmit = () => {
    const first = issues[0];
    if (first) {
      form.set({ attempted: true });
      scrollToCard(first.card);
      return;
    }
    void actions.submit();
  };

  const bar = (
    <AddSubmitBar
      state={state}
      missing={missingText(issues.map((i) => i.code))}
      progress={s.progress}
      failure={s.error ? t(s.error === "network" ? "add.error.network" : `add.error.${s.error}`) : undefined}
      onSubmit={onSubmit}
    />
  );

  const cards = (
    <div class="add__cards" {...(uploading ? { inert: true } : {})}>
      {s.restored && (
        <Banner kind="info" icon="clock" action={{ label: t("add.draft.discard"), onClick: actions.discardDraft }}>
          {t("add.draft.restored")}
        </Banner>
      )}
      <PhotoCard form={form} />
      <LocationCard form={form} />
      <WhatCard form={form} />
    </div>
  );

  const dialogs = (
    <>
      <DuplicateDialog form={form} />
      <Dialog
        open={help}
        title={t("add.help.title")}
        onClose={() => setHelp(false)}
        actions={<Button variant="primary" onClick={() => setHelp(false)}>{t("add.help.ok")}</Button>}
      >
        <p class="mp-dialog__body">{t("add.help.body")}</p>
      </Dialog>
    </>
  );

  if (desktop) {
    return (
      <div class="add add--desktop">
        <AddStyles />
        <AppHeader variant="desktop" active="map" search={<></>} />
        <div class="add__body">
          <section class="add__form" aria-labelledby="add-title">
            <div class="add__form-head">
              <h1 id="add-title">{t("add.title")}</h1>
              <span class="mp-badge">{t("add.steps")}</span>
            </div>
            <div class="add__scroll">{cards}</div>
            {bar}
          </section>
          <div class="add__map"><DesktopMap form={form} /></div>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div class="add">
      <AddStyles />
      <AppHeader variant="bar" title={t("add.title")} onClose={() => navigate("/")} onHelp={() => setHelp(true)} />
      <div class="add__scroll">{cards}</div>
      {bar}
      {dialogs}
    </div>
  );
}
