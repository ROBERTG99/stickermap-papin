import { TypeGrid } from "../components/Chip";
import { Combobox } from "../components/Field";
import { StickerCard } from "../components/StickerCard";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { TextAreaField } from "../components/Field";
import { t } from "../lib/i18n";
import { people, types as typeList } from "../lib/store";
import { NOTE_MAX, OTHER_TEXT_MAX } from "./logic";
import type { AddForm } from "./useAddForm";

/** Type tiles + "Soy:" (the person who uploads is the one who stuck it). Shared by card 3 and the "Agregar sticker a ese lugar" sheet. */
export function WhatFields({ form, showErrors }: { form: AddForm; showErrors: boolean }) {
  const { s, actions } = form;

  return (
    <>
      {showErrors && s.types.length === 0 && (
        <div class="mp-field__error" role="alert" style={{ marginBottom: "var(--space-3)" }}>
          <Icon name="alert" />
          {t("add.what.typeError")}
        </div>
      )}
      <TypeGrid
        types={typeList.value}
        value={s.types}
        onChange={(types) => form.set({ types })}
        otherText={s.otherText}
        onOtherTextChange={(otherText) => form.set({ otherText: otherText.slice(0, OTHER_TEXT_MAX) })}
        label={t("add.what.group")}
      />
      <div class="add-what">
        <Combobox
          label={t("add.what.soy")}
          options={people.value.map((p) => ({ name: p.name, count: p.reported }))}
          value={s.soy ? [s.soy] : []}
          onChange={(names) => actions.setSoy(names[0] ?? "")}
          multiple={false}
          allowCreate
        />
      </div>
    </>
  );
}

/** Card 3, ¿Qué sticker?. */
export function WhatCard({ form }: { form: AddForm }) {
  const { s, issues } = form;
  const invalid = s.attempted && issues.some((i) => i.card === 3);
  const ready = s.types.length > 0 && !issues.some((i) => i.card === 3);
  return (
    <StickerCard
      id="add-card-3"
      step={3}
      title={t("add.what.title")}
      state={ready ? "done" : invalid ? "invalid" : "default"}
      status={t("add.status.missing")}
    >
      <WhatFields form={form} showErrors={s.attempted} />
      <div class="add-what" style={{ marginTop: "var(--space-4)" }}>
        {s.noteOpen ? (
          <TextAreaField
            label={t("add.what.note")}
            value={s.note}
            maxLength={NOTE_MAX}
            placeholder={t("add.what.notePlaceholder")}
            onInput={(e) => form.set({ note: e.currentTarget.value })}
          />
        ) : (
          <Button variant="ghost" class="add-note" onClick={() => form.set({ noteOpen: true })}>
            {t("add.what.addNote")}
          </Button>
        )}
      </div>
    </StickerCard>
  );
}
