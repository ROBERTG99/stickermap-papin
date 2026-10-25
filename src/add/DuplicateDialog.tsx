import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { formatDate } from "../lib/format";
import { lang, t } from "../lib/i18n";
import { typeBySlug } from "../lib/store";
import { WhatFields } from "./WhatCard";
import type { AddForm } from "./useAddForm";

/**
 * "Esta foto ya está en el mapa, ¿es otro sticker en la misma foto?" (same SHA-256). Two stages: ask, then the
 * type + "¿Quién lo pegó?" fields that go to `POST /api/spots/:id/types`.
 */
export function DuplicateDialog({ form }: { form: AddForm }) {
  const { s, actions } = form;
  const stage = s.duplicateStage;
  const dup = s.duplicate;
  if (!dup) return null;
  const spot = dup.spot;
  const place = spot?.place_name || spot?.city || spot?.country || "";
  const typeLabels = spot ? spot.types.map((slug) => typeBySlug.value.get(slug)?.label ?? slug).join(", ") : "";
  const meta = [place, typeLabels].filter(Boolean).join(" · ");
  const by = spot ? t("add.dup.by", { name: spot.reporter ?? t("add.common.anonymous"), date: formatDate(spot.created_at, lang.value) }) : "";
  const close = () => actions.dismissDuplicate(false);

  if (stage === "add") {
    const blocked = s.types.length === 0;
    return (
      <Dialog
        open
        title={t("add.dup.addTitle")}
        onClose={() => form.set({ duplicateStage: "ask" })}
        actions={
          <>
            <Button variant="primary" loading={s.addingHere} aria-disabled={blocked ? "true" : undefined} onClick={() => (blocked ? form.set({ attempted: true }) : void actions.addToExisting())}>
              {t("add.dup.addSubmit")}
            </Button>
            <Button variant="secondary" onClick={() => form.set({ duplicateStage: "ask" })}>
              {t("add.common.back")}
            </Button>
          </>
        }
      >
        <p class="mp-dialog__body">{t("add.dup.addBody")}</p>
        <div class="add-dup__form">
          <WhatFields form={form} showErrors={s.attempted} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={stage === "ask"}
      title={t("add.dup.title")}
      onClose={close}
      art={spot ? (
        <div class="add-dup__art">
          {spot?.thumb && (
            <div class="add-dup__thumb"><img src={spot.thumb} alt="" /></div>
          )}
          <div>
            {meta && <b style={{ color: "var(--ink-strong)" }}>{meta}</b>}
            {by && <><br /><span class="mp-field__hint">{by}</span></>}
          </div>
        </div>
      ) : undefined}
      actions={
        <>
          <Button variant="primary" onClick={() => form.set({ duplicateStage: "add" })}>
            {t("add.dup.addHere")}
          </Button>
          <Button variant="secondary" onClick={() => actions.dismissDuplicate(true)}>
            {t("add.dup.other")}
          </Button>
        </>
      }
    >
      <p class="mp-dialog__body">{t("add.dup.body")}</p>
    </Dialog>
  );
}
