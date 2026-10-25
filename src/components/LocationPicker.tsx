import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./Icon";
import { cx } from "../lib/cx";
import { lang, t } from "../lib/i18n";
import type { LocationSource } from "../shared/types";

/** Device fixes worse than this (metres) turn the badge tomato and ask the user to drag the pin. */
export const LOW_ACCURACY_M = 100;

/** Debounce for the place search (design README: 300 ms). */
const SEARCH_DEBOUNCE_MS = 300;

/* Layout-only inline styles: the design system has no class for these two grids (same as the previews). */
const GRID = { display: "grid", gap: "var(--space-3)" } as const;
const TILE_LAYOUT = { padding: "8px", gap: "6px", alignItems: "stretch", textAlign: "left" } as const;

/* ── Source badge ─────────────────────────────────────────────────────── */

interface SourceMeta {
  icon: IconName;
  label: string;
  /** Label of the "restore" button after the user moved the pin. */
  revert: string;
}

const SOURCE_ICONS: Record<LocationSource, IconName> = {
  exif: "camera",
  device: "locate",
  pin: "hand",
  search: "search",
  paste: "link",
  legacy: "pin",
};

function sourceInfo(source: LocationSource): SourceMeta {
  return {
    icon: SOURCE_ICONS[source],
    label: t(`components.loc.${source === "paste" ? "paste" : source}`),
    revert: t(`components.loc.${source}Revert`),
  };
}

/** Icon + words for a location source (shared with the bulk-add rows). */
export function sourceMeta(source: LocationSource): Pick<SourceMeta, "icon" | "label"> {
  const { icon, label } = sourceInfo(source);
  return { icon, label };
}

export interface LocationBadgeProps {
  /** `pending` = still resolving the device position (spinner). */
  source: LocationSource | "pending";
  /** Device accuracy in metres; shown as "(±12 m)" and turns the badge tomato above `LOW_ACCURACY_M`. */
  accuracyM?: number | null;
  /** F1: the "exif" location came from a video, not a photo. */
  media?: "video";
  class?: string;
}

/** The `mp-src` badge under the mini-map: line icon + words, never emoji. */
export function LocationBadge({ source, accuracyM, media, class: className }: LocationBadgeProps) {
  if (source === "pending") {
    return (
      <span class={cx("mp-src mp-src--pending", className)}>
        <span class="mp-spinner" aria-hidden="true" />
        {t("components.loc.finding")}
      </span>
    );
  }
  const info = sourceInfo(source);
  const video = source === "exif" && media === "video";
  const icon = video ? "video" : info.icon;
  const label = video ? t("components.loc.exifVideo") : info.label;
  const hasAccuracy = source === "device" && accuracyM != null;
  const warn = hasAccuracy && accuracyM > LOW_ACCURACY_M;
  return (
    <span class={cx("mp-src", warn && "mp-src--warn", source === "pin" && "mp-src--manual", className)}>
      <Icon name={icon} />
      {hasAccuracy ? `${label} (±${Math.round(accuracyM)} m)` : label}
    </span>
  );
}

/* ── State ────────────────────────────────────────────────────────────── */

export interface ConflictOption {
  /** Place name shown under the tile ("Shanghái"). */
  place: string;
  /** Static mini-map for this option (the real one is mounted by the page). */
  map?: ComponentChildren;
}

/** The nine states of the Ubicación card (design/components/LocationPicker). */
export type LocationState =
  /** Gallery photo without GPS: grey pin, "¿Dónde está el sticker?". */
  | { kind: "empty" }
  /** Waiting for the device position. */
  | { kind: "resolving" }
  /** Photo EXIF GPS. */
  | { kind: "exif"; media?: "video" }
  /** Device position (`accuracyM` > 100 renders as the low-accuracy state). */
  | { kind: "device"; accuracyM: number }
  /** A place picked from the search results. */
  | { kind: "search" }
  /** A parsed link or coordinates; `coords` is what was read ("-34.9061, -56.1993"). */
  | { kind: "link"; text: string; coords: string }
  /** EXIF and device more than 50 km apart: the user must choose. */
  | { kind: "conflict"; selected: "exif" | "device"; distanceKm: number; exif: ConflictOption; device: ConflictOption }
  /** Device fix worse than ±100 m. */
  | { kind: "lowAccuracy"; accuracyM: number }
  /** The user dragged the pin; `from` is the source "Volver a…" restores. */
  | { kind: "moved"; from?: Exclude<LocationSource, "pin"> };

export interface SearchResult {
  id: string;
  /** "Plaza Independencia, Montevideo". */
  label: string;
}

export interface LocationPickerProps {
  state: LocationState;
  approximate: boolean;
  onApproximateChange: (value: boolean) => void;
  onUseDevice: () => void;
  /** Called (debounced 300 ms) with the trimmed search text; the page fills `searchResults`. */
  onSearch: (query: string) => void;
  onPickResult?: (result: SearchResult) => void;
  onPaste: (text: string) => void;
  onPickConflict: (which: "exif" | "device") => void;
  /** "Volver a la foto / …" after the pin was moved. */
  onRevert?: () => void;
  searchResults?: readonly SearchResult[];
  /** Initial text of the search box. */
  defaultQuery?: string;
  /** Geolocation permission was denied: only the locate button is disabled. */
  locateDenied?: boolean;
  /** Parse failure of the pasted text. */
  pasteError?: string;
  /** Slot for the mini-map (MapLibre in the app, a placeholder in the kitchen sink). */
  children?: ComponentChildren;
  class?: string;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

const NO_RESULTS: readonly SearchResult[] = [];
const kmFormats = { es: new Intl.NumberFormat("es-UY"), en: new Intl.NumberFormat("en-US") };

/** The "Ubicación" card of the add form: mini-map slot + source badge + tools. */
export function LocationPicker(props: LocationPickerProps) {
  const {
    approximate, onApproximateChange, onUseDevice, onSearch, onPickResult, onPaste, onPickConflict, onRevert,
    searchResults = NO_RESULTS, defaultQuery = "", locateDenied, pasteError, children, class: className,
  } = props;
  // A device fix this coarse is the low-accuracy state whatever the caller labelled it.
  const state: LocationState =
    props.state.kind === "device" && props.state.accuracyM > LOW_ACCURACY_M
      ? { kind: "lowAccuracy", accuracyM: props.state.accuracyM }
      : props.state;

  const uid = useId();
  const [query, setQuery] = useState(defaultQuery);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState(state.kind === "link" ? state.text : "");
  const timer = useRef<number | undefined>(undefined);
  const lastPasted = useRef(pasteText);
  const pasteInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (state.kind === "link") {
      setPasteText(state.text);
      lastPasted.current = state.text;
    }
  }, [state.kind === "link" ? state.text : null]);
  useEffect(() => {
    if (pasteOpen) pasteInput.current?.focus();
  }, [pasteOpen]);
  useEffect(() => setActive(0), [searchResults]);

  const searchOpen = searchResults.length > 0 && !dismissed;
  const conflict = state.kind === "conflict";
  const showPaste = pasteOpen || state.kind === "link";
  const listId = `${uid}-list`;

  const pick = (result: SearchResult | undefined) => {
    if (!result) return;
    setQuery(result.label);
    setDismissed(true);
    onPickResult?.(result);
  };

  const onSearchInput = (value: string) => {
    setQuery(value);
    setDismissed(false);
    window.clearTimeout(timer.current);
    if (!value.trim()) onSearch("");
    else timer.current = window.setTimeout(() => onSearch(value.trim()), SEARCH_DEBOUNCE_MS);
  };

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" && searchOpen) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp" && searchOpen) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && searchOpen) {
      e.preventDefault();
      pick(searchResults[active]);
    } else if (e.key === "Escape" && searchOpen) {
      e.preventDefault();
      setDismissed(true);
    }
  };

  const commitPaste = (text: string) => {
    const value = text.trim();
    if (!value || value === lastPasted.current) return;
    lastPasted.current = value;
    onPaste(value);
  };

  const badge =
    state.kind === "resolving" ? <LocationBadge source="pending" />
    : state.kind === "exif" ? <LocationBadge source="exif" media={state.media} />
    : state.kind === "device" ? <LocationBadge source="device" accuracyM={state.accuracyM} />
    : state.kind === "lowAccuracy" ? <LocationBadge source="device" accuracyM={state.accuracyM} />
    : state.kind === "search" ? <LocationBadge source="search" />
    : state.kind === "link" ? <LocationBadge source="paste" />
    : state.kind === "moved" ? <LocationBadge source="pin" />
    : null;

  const hint =
    state.kind === "lowAccuracy" ? t("components.loc.lowAccuracy", { m: Math.round(state.accuracyM) })
    : state.kind === "exif" || state.kind === "device" || state.kind === "search" || state.kind === "link"
      ? t("components.loc.dragPin")
    : null;

  const revertLabel = state.kind === "moved" && state.from ? sourceInfo(state.from).revert : null;

  return (
    <div class={cx("mp-card", className)} style={GRID}>
      {(state.kind === "empty" || conflict) && !searchOpen && (
        <h3 class="mp-card__title">{conflict ? t("components.loc.conflictTitle") : t("components.loc.whereTitle")}</h3>
      )}

      {conflict && (
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" role="group" aria-label={t("components.loc.choose")}>
          {(["exif", "device"] as const).map((which) => {
            const option = state[which];
            return (
              <button
                key={which}
                type="button"
                class="mp-typetile"
                style={TILE_LAYOUT}
                aria-pressed={state.selected === which}
                onClick={() => onPickConflict(which)}
              >
                <span class="mp-typetile__tick"><Icon name="check" /></span>
                <div class="mp-photo mp-photo--empty" style="--ratio:3/2" data-pin="confirmed">{option.map}</div>
                <span>
                  <Icon name={which === "exif" ? "camera" : "locate"} size="sm" />{" "}
                  {which === "exif" ? t("components.loc.photoTaken") : t("components.loc.youAre")}
                  <br />
                  <b>{option.place}</b>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {conflict && (
        <span class="mp-field__hint">{t("components.loc.apart", { km: kmFormats[lang.value].format(state.distanceKm) })}</span>
      )}

      {!conflict && !searchOpen && (
        <div
          class="mp-photo mp-photo--empty"
          style="--ratio:13/6"
          role="group"
          aria-label={t("components.loc.mapLabel")}
          data-pin={state.kind === "empty" || state.kind === "resolving" ? "unconfirmed" : "confirmed"}
        >
          {children}
        </div>
      )}

      {locateDenied && !conflict && (
        <div class="mp-banner mp-banner--error" id={`${uid}-denied`} role="status">
          <Icon name="locate" />
          {t("components.loc.denied")}
        </div>
      )}

      {badge && (
        <div class="mp-chips" role="status">
          {badge}
          {revertLabel && onRevert && (
            <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" onClick={onRevert}>
              <Icon name="rotate" size="sm" />
              {revertLabel}
            </button>
          )}
        </div>
      )}
      {state.kind === "link" && (
        <span class="mp-field__ok" id={`${uid}-coords`}>
          <Icon name="check" size="sm" />
          {state.coords}
        </span>
      )}
      {hint && <span class="mp-field__hint">{hint}</span>}

      {!conflict && (
        <div style={GRID}>
          {!searchOpen && (
            <div class="mp-chips">
              <button
                type="button"
                class="mp-btn mp-btn--secondary mp-btn--sm"
                disabled={locateDenied || state.kind === "resolving"}
                aria-describedby={locateDenied ? `${uid}-denied` : undefined}
                onClick={onUseDevice}
              >
                <Icon name="locate" size="sm" />
                {t("components.loc.useMine")}
              </button>
              <button
                type="button"
                class="mp-btn mp-btn--secondary mp-btn--sm"
                aria-expanded={showPaste}
                aria-controls={`${uid}-paste`}
                onClick={() => setPasteOpen((open) => !open)}
              >
                <Icon name="link" size="sm" />
                {t("components.loc.pasteLink")}
              </button>
            </div>
          )}

          {!searchOpen && showPaste && (
            <div class="mp-field" id={`${uid}-paste`}>
              <label class="mp-field__label" for={`${uid}-paste-input`}>{t("components.loc.pasteLink")}</label>
              <input
                ref={pasteInput}
                id={`${uid}-paste-input`}
                class="mp-input mp-input--mono"
                value={pasteText}
                spellcheck={false}
                autocomplete="off"
                aria-invalid={pasteError ? true : undefined}
                aria-describedby={pasteError ? `${uid}-paste-err` : state.kind === "link" ? `${uid}-coords` : undefined}
                onInput={(e) => setPasteText(e.currentTarget.value)}
                onPaste={(e) => commitPaste(e.clipboardData?.getData("text") ?? "")}
                onChange={(e) => commitPaste(e.currentTarget.value)}
              />
              {pasteError && (
                <span class="mp-field__error" id={`${uid}-paste-err`} role="alert">
                  <Icon name="alert" />
                  {pasteError}
                </span>
              )}
            </div>
          )}

          <label class="mp-search">
            <Icon name="search" />
            <input
              class="mp-input"
              placeholder={t("components.loc.searchPlaceholder")}
              aria-label={t("components.header.searchPlace")}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls={listId}
              aria-activedescendant={searchOpen ? `${uid}-opt-${active}` : undefined}
              autocomplete="off"
              value={query}
              onInput={(e) => onSearchInput(e.currentTarget.value)}
              onKeyDown={onSearchKey}
            />
          </label>
          {searchOpen && (
            <ul class="mp-listbox" role="listbox" id={listId} aria-label={t("components.loc.results")}>
              {searchResults.map((result, i) => (
                <li
                  key={result.id}
                  id={`${uid}-opt-${i}`}
                  class="mp-option"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(result)}
                >
                  <Icon name="pin" size="sm" />
                  <span><Highlight text={result.label} query={query} /></span>
                </li>
              ))}
            </ul>
          )}

          {state.kind === "empty" && (
            <span class="mp-field__hint">
              <Icon name="info" size="sm" /> {t("components.loc.iphonePre")}<b>{t("components.loc.iphoneBold")}</b>{t("components.loc.iphonePost")}
            </span>
          )}
        </div>
      )}

      {!conflict && !searchOpen && (
        <div class="mp-switchrow">
          <div class="mp-switchrow__text" id={`${uid}-approx`}>
            <b>{t("components.loc.approx")}</b>
            <span>{t("components.loc.approxHint")}</span>
          </div>
          <button
            type="button"
            class="mp-switch"
            role="switch"
            aria-checked={approximate}
            aria-labelledby={`${uid}-approx`}
            onClick={() => onApproximateChange(!approximate)}
          />
        </div>
      )}
    </div>
  );
}
