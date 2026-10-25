import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { FilterChip, PersonAvatar, TypeChip } from "../../components/Chip";
import { t } from "../../lib/i18n";
import { people, types } from "../../lib/store";
import {
  DATE_PRESETS,
  UNKNOWN_PLACER,
  listCountries,
  placerKeys,
  rankNames,
  toggleValue,
  type DatePreset,
} from "../../map/filters";
import { allFeatures, clearFilters, facets, filters, setFilters } from "./state";

/** People chips show this many names before "Ver los N". */
const PEOPLE_COLLAPSED = 8;

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="mp-field">
      <span class="mp-field__label">{title}</span>
      {children}
    </div>
  );
}

interface PeopleProps {
  title: string;
  names: string[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (name: string) => void;
  /** Special keys ("unknown placer", "anonymous") are printed with a label and no avatar. */
  special: Record<string, string>;
  searchable?: boolean;
}

/** Person chips with their count (Pegado por / Cargado por): search, first few, "Ver los N". */
function PeopleSection({ title, names, counts, selected, onToggle, special, searchable }: PeopleProps) {
  const [needle, setNeedle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const q = needle.trim().toLowerCase();
  const label = (n: string) => special[n] ?? n;
  const matching = q ? names.filter((n) => label(n).toLowerCase().includes(q)) : names;
  const visible = expanded || q ? matching : [...new Set([...matching.slice(0, PEOPLE_COLLAPSED), ...selected.filter((s) => matching.includes(s))])];
  const hidden = matching.length - visible.length;

  return (
    <Section title={title}>
      {searchable && (
        <label class="mp-search mp-search--compact">
          <Icon name="search" />
          <input class="mp-input" type="search" placeholder={t("map.filters.searchPerson")} aria-label={t("map.filters.searchPerson")} value={needle} onInput={(e) => setNeedle(e.currentTarget.value)} />
        </label>
      )}
      <div class="mp-chips">
        {visible.map((name) => {
          const count = counts.get(name) ?? 0;
          const on = selected.includes(name);
          return (
            <button key={name} type="button" class="mp-chip" aria-pressed={on} disabled={count === 0 && !on} onClick={() => onToggle(name)}>
              {special[name] === undefined && <PersonAvatar name={name} />}
              {label(name)}
              <span class="mp-chip__count">{count}</span>
              <span class="mp-chip__tick">
                <Icon name="check" />
              </span>
            </button>
          );
        })}
        {hidden > 0 && (
          <button type="button" class="mp-chip mp-chip--add" onClick={() => setExpanded(true)}>
            {t("map.filters.showAll", { n: matching.length })}
          </button>
        )}
        {expanded && !q && matching.length > PEOPLE_COLLAPSED && (
          <button type="button" class="mp-chip mp-chip--add" onClick={() => setExpanded(false)}>
            {t("map.filters.showLess")}
          </button>
        )}
        {q && matching.length === 0 && <span class="mp-field__hint">{t("map.filters.noMatch")}</span>}
      </div>
    </Section>
  );
}

const DATE_LABELS: Record<DatePreset, string> = {
  all: "map.filters.dateAll",
  month: "map.filters.dateMonth",
  halfYear: "map.filters.dateHalfYear",
  year: "map.filters.dateYear",
};

/** The five filter groups, shared by the mobile modal sheet and the desktop drawer. Chip counts follow the OTHER filters. */
export function FilterSections() {
  const f = filters.value;
  const counts = facets.value;
  const features = allFeatures.value;

  const countries = useMemo(() => listCountries(features), [features]);
  const placerNames = useMemo(() => {
    const seen = rankNames(features, placerKeys);
    const extra = people.value.filter((p) => p.placed > 0 && !seen.includes(p.name)).map((p) => p.name);
    return [...seen, ...extra];
  }, [features, people.value]);

  return (
    <>
      <Section title={t("map.filters.types")}>
        <div class="mp-chips">
          {types.value.map((type, i) => {
            const count = counts.types.get(type.slug) ?? 0;
            const on = f.types.includes(type.slug);
            return <TypeChip key={type.slug} type={type} index={i} count={count} selected={on} disabled={count === 0 && !on} onToggle={(slug) => setFilters({ ...filters.value, types: toggleValue(filters.value.types, slug) })} />;
          })}
        </div>
      </Section>
      <PeopleSection
        title={t("map.filters.placers")}
        names={placerNames}
        counts={counts.placers}
        selected={f.placers}
        special={{ [UNKNOWN_PLACER]: t("common.person.unknownPlacer") }}
        searchable
        onToggle={(n) => setFilters({ ...filters.value, placers: toggleValue(filters.value.placers, n) })}
      />
      {countries.length > 0 && (
        <Section title={t("map.filters.countries")}>
          <div class="mp-chips">
            {countries.map((c) => {
              const count = counts.countries.get(c.code) ?? 0;
              const on = f.countries.includes(c.code);
              return <FilterChip key={c.code} flag={c.code} label={c.name} count={count} selected={on} disabled={count === 0 && !on} onToggle={() => setFilters({ ...filters.value, countries: toggleValue(filters.value.countries, c.code) })} />;
            })}
          </div>
        </Section>
      )}
      <Section title={t("map.filters.date")}>
        <div class="mp-chips">
          {DATE_PRESETS.map((preset) => {
            const on = f.date === preset;
            return <FilterChip key={preset} label={t(DATE_LABELS[preset])} selected={on} count={preset === "all" ? undefined : counts.date[preset]} disabled={preset !== "all" && counts.date[preset] === 0 && !on} onToggle={() => setFilters({ ...filters.value, date: preset })} />;
          })}
        </div>
      </Section>
    </>
  );
}

/** "Limpiar" + "Ver 37 stickers". */
export function FilterFooter({ onDone, activeCount }: { onDone: () => void; activeCount: number }) {
  const total = facets.value.total;
  const label = total === 0 ? t("map.filters.showNone") : total === 1 ? t("map.filters.showOne") : t("map.filters.show", { n: total });
  return (
    <>
      <button type="button" class="mp-btn mp-btn--ghost" disabled={activeCount === 0} onClick={clearFilters}>
        {t("map.filters.clear")}
      </button>
      <button type="button" class="mp-btn mp-btn--primary" onClick={onDone}>
        {label}
      </button>
    </>
  );
}
