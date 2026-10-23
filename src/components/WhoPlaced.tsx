import { useEffect, useId, useRef } from "preact/hooks";
import type { PersonSummary, PlacerStatus } from "../shared/types";
import { t } from "../lib/i18n";
import { AddChip, PersonAvatar, PersonChip } from "./Chip";
import { Combobox } from "./Field";
import { Segmented, type SegmentedOption } from "./Segmented";

/** Data out of "¿Quién lo pegó?". `placers` is `[soy]` for self, the picked names for other, `[]` for unknown. */
export interface WhoPlacedValue {
  status: PlacerStatus;
  placers: string[];
  /** Optional "¿Algún dato?" (only meaningful for `unknown`). */
  note?: string;
}

/** Initial value: "Yo" when "Soy:" has a name, otherwise "No sé". */
export function defaultWhoPlaced(soy: string): WhoPlacedValue {
  const name = soy.trim();
  return name ? { status: "self", placers: [name] } : { status: "unknown", placers: [] };
}

/** Spanish text of the validation error (kitchen-sink sample); the live validator returns the translated one. */
export const WHO_PLACED_ERROR = "Poné al menos un nombre, o elegí “No sé”.";

/** Returns the error message to show (on submit, then live) or `null` when valid. */
export function validateWhoPlaced(value: WhoPlacedValue): string | null {
  return value.status === "other" && value.placers.length === 0 ? t("components.who.error") : null;
}

const RECENT_KEY = "mp.recentPlacers";
const RECENT_MAX = 6;

/** Recent placers remembered in this browser (most recent first). Never throws. */
export function loadRecentPlacers(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Call after a successful submit with the placers that were sent. Returns the updated list. */
export function rememberPlacers(names: readonly string[]): string[] {
  const merged = [...names, ...loadRecentPlacers()].filter((n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
  const next = merged.slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: recents just are not remembered */
  }
  return next;
}

const options = (): readonly SegmentedOption<PlacerStatus>[] => [
  { value: "self", label: t("components.who.me") },
  { value: "other", label: t("components.who.others") },
  { value: "unknown", label: t("components.who.unknown") },
];

interface WhoPlacedProps {
  value: WhoPlacedValue;
  onChange: (value: WhoPlacedValue) => void;
  /** Current "Soy:" name ("" when empty = anonymous). */
  soy: string;
  /** Known people for the autocomplete (`/api/people`). */
  people: readonly PersonSummary[];
  /** Recent placers, one tap each. */
  recent?: readonly string[];
  /** Error from `validateWhoPlaced`; the parent decides when to show it. */
  error?: string | null;
  /** "Yo" was picked with "Soy:" empty: the parent focuses the "Soy:" field instead of erroring. */
  onRequestSoy?: () => void;
}

/**
 * "¿Quién lo pegó?": Yo / Otro/s / No sé, each with its own sub-UI. It records who stuck the
 * sticker separately from who reported it ("Soy:"). Controlled: the parent owns `value`.
 */
export function WhoPlaced({ value, onChange, soy, people, recent = [], error, onRequestSoy }: WhoPlacedProps) {
  const labelId = useId();
  const noteId = useId();
  const comboInput = useRef<HTMLInputElement>(null);
  const soyName = soy.trim();
  // Nothing typed is cleared when switching options: keep what each option had.
  const keep = useRef({ others: value.status === "other" ? value.placers : [], note: value.note ?? "" });
  if (value.status === "other") keep.current.others = value.placers;
  if (value.status === "unknown") keep.current.note = value.note ?? "";

  // "Yo" follows "Soy:": renamed -> credit the new name; emptied -> fall back to "No sé".
  useEffect(() => {
    if (value.status !== "self") return;
    if (!soyName) onChange({ status: "unknown", placers: [], note: keep.current.note || undefined });
    else if (value.placers[0] !== soyName || value.placers.length !== 1) onChange({ status: "self", placers: [soyName] });
  }, [soyName, value.status, value.placers, onChange]);

  function setStatus(status: PlacerStatus) {
    if (status === value.status) return;
    if (status === "self") {
      if (!soyName) {
        onRequestSoy?.();
        return;
      }
      onChange({ status, placers: [soyName] });
    } else if (status === "other") {
      onChange({ status, placers: keep.current.others });
    } else {
      onChange({ status, placers: [], note: keep.current.note || undefined });
    }
  }

  function toggleRecent(name: string) {
    const has = value.placers.some((p) => p.toLowerCase() === name.toLowerCase());
    onChange({ status: "other", placers: has ? value.placers.filter((p) => p.toLowerCase() !== name.toLowerCase()) : [...value.placers, name] });
  }

  return (
    <div class="mp-card mp-stack">
      <span class="mp-field__label" id={labelId}>
        {t("components.who.question")}
      </span>
      <Segmented options={options()} value={value.status} onChange={setStatus} labelledBy={labelId} />

      {value.status === "self" && (
        <div class="mp-spot__by">
          <PersonAvatar name={soyName} size={34} index={0} />
          <div>
            <span class="mp-spot__by-label">{t("components.spot.placedBy")}</span>
            <span class="mp-spot__by-names">{t("common.person.you", { name: soyName })}</span>
          </div>
        </div>
      )}

      {value.status === "other" && (
        <>
          <Combobox
            label={t("components.who.addName")}
            hideLabel
            placeholder={t("components.who.addName")}
            options={people.map((p) => ({ name: p.name, count: p.placed }))}
            value={value.placers}
            onChange={(placers) => onChange({ status: "other", placers })}
            allowCreate
            selfName={soyName || undefined}
            error={error ?? undefined}
            inputRef={comboInput}
          />
          {recent.length > 0 && <span class="mp-field__hint">{t("components.who.recent")}</span>}
          <div class="mp-chips">
            {recent.map((name, i) => (
              <PersonChip key={name} name={name} index={i} selected={value.placers.some((p) => p.toLowerCase() === name.toLowerCase())} onToggle={toggleRecent} />
            ))}
            <AddChip onClick={() => comboInput.current?.focus()} />
          </div>
        </>
      )}

      {value.status === "unknown" && (
        <>
          <div class="mp-field">
            <label class="mp-field__label" for={noteId}>
              {t("components.who.note")}
            </label>
            <input
              id={noteId}
              class="mp-input"
              placeholder={t("components.who.notePlaceholder")}
              maxLength={280}
              value={value.note ?? ""}
              onInput={(e) => onChange({ status: "unknown", placers: [], note: e.currentTarget.value || undefined })}
            />
          </div>
          <span class="mp-field__hint">{t("components.who.unknownHint")}</span>
        </>
      )}
    </div>
  );
}
