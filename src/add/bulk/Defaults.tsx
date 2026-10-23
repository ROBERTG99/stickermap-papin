import { useCallback, useRef, useState } from "preact/hooks";
import { TypeGrid } from "../../components/Chip";
import { Combobox, SwitchRow } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { loadRecentPlacers, validateWhoPlaced, WhoPlaced, type WhoPlacedValue } from "../../components/WhoPlaced";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { people, types } from "../../lib/store";
import { originalsBytes, setDefaults } from "./bulk";
import type { BulkProblem } from "./effective";
import { approxSize } from "./ui";
import type { BulkDefaults } from "./types";

/** "Para todas las fotos": type (required), ¿Quién lo pegó?, Soy, and the collapsed "Más opciones". */
export function DefaultsCard({ d, problem, showProblem }: { d: BulkDefaults; problem: BulkProblem | null; showProblem: boolean }) {
  const [more, setMore] = useState(false);
  const soyInput = useRef<HTMLInputElement>(null);
  const onPlacer = useCallback((placer: WhoPlacedValue) => setDefaults({ placer }), []);
  const done = d.types.length > 0;
  const invalid = showProblem && (problem === "type" || problem === "other" || problem === "placer");

  return (
    <section class={cx("mp-card bulk-defaults", invalid && "is-invalid")} id="bulk-defaults" aria-labelledby="bulk-defaults-title">
      <div class="mp-card__head" style={{ marginBottom: 0 }}>
        <span class="mp-card__num" aria-hidden="true">1</span>
        <h2 class="mp-card__title" id="bulk-defaults-title">{t("bulk.defaults.title")}</h2>
        <span class={cx("mp-card__status", !done && "mp-card__status--todo")}>
          {done && <Icon name="check" size="sm" />}
          {done ? t("bulk.defaults.done") : t("bulk.defaults.todo")}
        </span>
      </div>

      <div class="bulk__stack">
        <span class="bulk-defaults__label">
          {t("bulk.defaults.type")} <small>{t("bulk.defaults.typeHint")}</small>
        </span>
        <TypeGrid
          types={types.value}
          value={d.types}
          onChange={(next) => setDefaults({ types: next })}
          otherText={d.otherText}
          onOtherTextChange={(otherText) => setDefaults({ otherText })}
          otherError={showProblem && problem === "other" ? t("bulk.defaults.otherError") : undefined}
          label={t("bulk.defaults.typeAria")}
        />
        {showProblem && problem === "type" && (
          <span class="mp-field__error" role="alert"><Icon name="alert" />{t("bulk.defaults.typeError")}</span>
        )}
      </div>

      <WhoPlaced
        value={d.placer}
        onChange={onPlacer}
        soy={d.soy}
        people={people.value}
        recent={loadRecentPlacers()}
        error={showProblem ? validateWhoPlaced(d.placer) : null}
        onRequestSoy={() => soyInput.current?.focus()}
      />

      <Combobox
        label={t("bulk.defaults.soy")}
        options={people.value.map((p) => ({ name: p.name, count: p.placed }))}
        value={d.soy ? [d.soy] : []}
        onChange={(v) => setDefaults({ soy: v[0] ?? "" })}
        multiple={false}
        allowCreate
        placeholder={t("bulk.defaults.soyPlaceholder")}
        inputRef={soyInput}
      />

      <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm bulk-defaults__more" aria-expanded={more} aria-controls="bulk-more" onClick={() => setMore(!more)}>
        {t("bulk.defaults.more")}
        <Icon name="chevron-down" size="sm" />
      </button>
      {more && (
        <div class="bulk__stack" id="bulk-more">
          <SwitchRow
            label={t("bulk.defaults.approx")}
            description={t("bulk.defaults.approxHint")}
            checked={d.approximate}
            onChange={(approximate) => setDefaults({ approximate })}
          />
          <SwitchRow
            label={t("bulk.defaults.originals")}
            description={t("bulk.defaults.originalsHint", { size: approxSize(originalsBytes.value) })}
            checked={d.originals}
            onChange={(originals) => setDefaults({ originals })}
          />
        </div>
      )}
    </section>
  );
}
