import type { ComponentChildren, JSX, LooseInputHTMLAttributes, Ref } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { PersonAvatar, RemovablePersonChip } from "./Chip";
import { Icon } from "./Icon";

/* ── Shared bits ─────────────────────────────────────────────────────────── */

/** Lowercase, accent-insensitive key used to compare and match names. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Wraps the part of `text` that matches `query` in `<mark>`. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = norm(query.trim());
  const n = norm(text);
  const at = q && n.length === text.length ? n.indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

interface ListItem {
  key: string;
  /** Text of the option; for the add option it is the name that would be created. */
  label: string;
  meta?: ComponentChildren;
  lead?: ComponentChildren;
  add?: boolean;
}

interface OptionListProps {
  id: string;
  label: string;
  items: ListItem[];
  active: number;
  query: string;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
}

/** `ul.mp-listbox` of `li.mp-option`; the input keeps focus (options never take it). */
function OptionList({ id, label, items, active, query, onPick, onHover }: OptionListProps) {
  return (
    <ul id={id} class="mp-listbox" role="listbox" aria-label={label}>
      {items.map((it, i) => (
        <li
          key={it.key}
          id={`${id}-${i}`}
          class={cx("mp-option", it.add && "mp-option--add")}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => onHover(i)}
          onClick={() => onPick(i)}
        >
          {it.add ? (
            <>
              <Icon name="plus" />
              {t("components.field.add", { name: it.label })}
            </>
          ) : (
            <>
              {it.lead}
              <span>
                <Highlighted text={it.label} query={query} />
              </span>
              {it.meta !== undefined && <span class="mp-option__meta">{it.meta}</span>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function FieldError({ id, children }: { id: string; children: ComponentChildren }) {
  return (
    <span class="mp-field__error" id={id}>
      <Icon name="alert" />
      {children}
    </span>
  );
}

/* ── Text input ──────────────────────────────────────────────────────────── */

type TextFieldProps = Omit<LooseInputHTMLAttributes<HTMLInputElement>, "class" | "className" | "children" | "role"> & {
  label: ComponentChildren;
  hint?: ComponentChildren;
  /** Says what to do ("Contanos cuál es el “Otro”."). Marks the field invalid. */
  error?: string;
  /** Positive confirmation under the field (e.g. parsed coordinates). */
  ok?: ComponentChildren;
  /** Monospace text for coordinates and links. */
  mono?: boolean;
  class?: string;
};

/** Labelled text input (`mp-input`, 48px, 16px text so iOS does not zoom). */
export function TextField({ label, hint, error, ok, mono, class: className, id, ...input }: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const okId = `${inputId}-ok`;
  const describedBy = [hint && hintId, error && errorId, ok && okId].filter(Boolean).join(" ");
  return (
    <div class={cx("mp-field", error && "is-invalid", className)}>
      <label class="mp-field__label" for={inputId}>
        {label}
      </label>
      <input
        {...(input as JSX.IntrinsicElements["input"])}
        id={inputId}
        class={cx("mp-input", mono && "mp-input--mono")}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <span class="mp-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {ok && (
        <span class="mp-field__ok" id={okId}>
          <Icon name="check" size="sm" />
          {ok}
        </span>
      )}
    </div>
  );
}

/* ── Textarea ────────────────────────────────────────────────────────────── */

type TextAreaFieldProps = Omit<JSX.IntrinsicElements["textarea"], "class" | "className" | "label" | "children" | "value"> & {
  label: ComponentChildren;
  value: string;
  /** Character limit; the counter shows "41/280". */
  maxLength?: number;
  hint?: ComponentChildren;
  error?: string;
  class?: string;
};

/** Labelled textarea with a live character counter. */
export function TextAreaField({ label, value, maxLength = 280, hint, error, class: className, id, ...area }: TextAreaFieldProps) {
  const auto = useId();
  const areaId = id ?? auto;
  const hintId = `${areaId}-hint`;
  const errorId = `${areaId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");
  return (
    <div class={cx("mp-field", error && "is-invalid", className)}>
      <label class="mp-field__label" for={areaId}>
        {label}
      </label>
      <textarea
        {...area}
        id={areaId}
        class="mp-input"
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <span class="mp-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <span class="mp-field__count">
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

/* ── Switch ──────────────────────────────────────────────────────────────── */

interface SwitchRowProps {
  /** Bold label. */
  label: string;
  /** One-line explanation under the label. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** `mp-switchrow`: bold label + one-line explanation + `role="switch"` button. */
export function SwitchRow({ label, description, checked, onChange, disabled }: SwitchRowProps) {
  const id = useId();
  return (
    <div class="mp-switchrow">
      <div class="mp-switchrow__text">
        <b id={`${id}-label`}>{label}</b>
        {description && <span id={`${id}-desc`}>{description}</span>}
      </div>
      <button
        type="button"
        class="mp-switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

/* ── Search ──────────────────────────────────────────────────────────────── */

export interface SearchResult {
  id: string;
  label: string;
  /** Secondary text on the right (city, country). */
  meta?: string;
}

interface SearchFieldProps {
  /** Accessible name; the field has no visible label ("Buscar lugar"). */
  label: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Called 300 ms after the user stops typing. */
  onSearch?: (query: string) => void;
  /** Results to show in the listbox (at most 5 are shown). */
  results?: readonly SearchResult[];
  onSelect?: (result: SearchResult) => void;
  /** 44px sunken variant for headers. */
  compact?: boolean;
  class?: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX_RESULTS = 5;

/** Search input with the results listbox right under it (ARIA 1.2 combobox on the input). */
export function SearchField({ label, placeholder, value, onValueChange, onSearch, results = [], onSelect, compact, class: className }: SearchFieldProps) {
  const listId = useId();
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = results.slice(0, SEARCH_MAX_RESULTS);
  const expanded = open && shown.length > 0;
  const activeIdx = expanded ? Math.min(active, shown.length - 1) : -1;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function pick(i: number) {
    const r = shown[i];
    if (!r) return;
    setOpen(false);
    setActive(-1);
    onSelect?.(r);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && shown.length) {
      e.preventDefault();
      setOpen(true);
      setActive(activeIdx + 1 >= shown.length ? 0 : activeIdx + 1);
    } else if (e.key === "ArrowUp" && shown.length) {
      e.preventDefault();
      setOpen(true);
      setActive(activeIdx <= 0 ? shown.length - 1 : activeIdx - 1);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(activeIdx);
    } else if (e.key === "Escape" && expanded) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div class={cx("mp-field", className)}>
      <label class={cx("mp-search", compact && "mp-search--compact")}>
        <Icon name="search" />
        <input
          class="mp-input"
          role="combobox"
          aria-label={label}
          inputMode="search"
          enterKeyHint="search"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
          autocomplete="off"
          placeholder={placeholder}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          onInput={(e) => {
            const v = e.currentTarget.value;
            onValueChange(v);
            setOpen(true);
            setActive(-1);
            window.clearTimeout(timer.current);
            if (onSearch) timer.current = window.setTimeout(() => onSearch(v.trim()), SEARCH_DEBOUNCE_MS);
          }}
        />
      </label>
      {expanded && (
        <OptionList
          id={listId}
          label={label}
          items={shown.map((r) => ({ key: r.id, label: r.label, meta: r.meta }))}
          active={activeIdx}
          query={value}
          onPick={pick}
          onHover={setActive}
        />
      )}
    </div>
  );
}

/* ── Combobox ────────────────────────────────────────────────────────────── */

export interface ComboboxOption {
  /** Canonical name (people are stored as typed). */
  name: string;
  /** Shown as meta on the right of the option (how many stickers the person has). */
  count?: number;
}

export interface ComboboxProps {
  /** Visible label ("Soy:", "Otras personas"). */
  label: string;
  /** Hide the visible label (the text is still the accessible name). */
  hideLabel?: boolean;
  /** Accessible name of the bare input when it differs from the label ("Cambiar nombre"). */
  inputLabel?: string;
  /** Suggestions (e.g. from `/api/people`). */
  options: readonly ComboboxOption[];
  /** Selected names, shown as removable chips. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** `false` keeps a single chip and picking replaces it ("Soy:"). Default `true`. */
  multiple?: boolean;
  /** Adds "Agregar “Nombre”" as the last option and commits typed names on Enter or blur. */
  allowCreate?: boolean;
  /** Shown only while nothing is selected. */
  placeholder?: string;
  /** Name rendered as "Nombre (vos)" (the current user). */
  selfName?: string;
  maxItems?: number;
  hint?: ComponentChildren;
  /** Says what to do; marks the field invalid. */
  error?: string;
  /** Receives the bare input, e.g. to focus it from outside. */
  inputRef?: Ref<HTMLInputElement>;
  class?: string;
}

const MAX_SUGGESTIONS = 5;

/**
 * People picker. ARIA 1.2 combobox: `role="combobox"` on the input, `aria-controls` the listbox,
 * `aria-activedescendant` the highlighted option. Selected people are removable chips.
 */
export function Combobox({
  label,
  hideLabel,
  inputLabel,
  options,
  value,
  onChange,
  multiple = true,
  allowCreate,
  placeholder,
  selfName,
  maxItems,
  hint,
  error,
  inputRef,
  class: className,
}: ComboboxProps) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const localRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const selectedKeys = new Set(value.map(norm));
  const q = norm(query.trim());
  const matches = options
    .filter((o) => !selectedKeys.has(norm(o.name)) && (q === "" || norm(o.name).includes(q)))
    .sort((a, b) => Number(norm(b.name).startsWith(q)) - Number(norm(a.name).startsWith(q)))
    .slice(0, MAX_SUGGESTIONS);
  const typed = cleanName(query);
  const exists = selectedKeys.has(q) || options.some((o) => norm(o.name) === q);
  const items: ListItem[] = matches.map((o) => ({
    key: o.name,
    label: o.name,
    meta: o.count,
    lead: <PersonAvatar name={o.name} size={28} />,
  }));
  if (allowCreate && typed && !exists) items.push({ key: "__add__", label: typed, add: true });
  const expanded = open && items.length > 0;
  const activeIdx = expanded ? Math.min(active, items.length - 1) : -1;
  const atLimit = multiple && maxItems !== undefined && value.length >= maxItems;

  function setInput(el: HTMLInputElement | null) {
    localRef.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) inputRef.current = el;
  }

  function add(raw: string) {
    const name = cleanName(raw);
    if (!name) return;
    const canonical = options.find((o) => norm(o.name) === norm(name))?.name ?? name;
    setQuery("");
    setActive(-1);
    setOpen(false);
    if (selectedKeys.has(norm(canonical)) || atLimit) return;
    onChange(multiple ? [...value, canonical] : [canonical]);
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
    localRef.current?.focus();
  }

  function pick(i: number) {
    const it = items[i];
    if (it) add(it.label);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive(activeIdx + 1 >= items.length ? 0 : activeIdx + 1);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive(activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
    } else if (e.key === "Enter") {
      if (activeIdx >= 0) {
        e.preventDefault();
        pick(activeIdx);
      } else if (typed && allowCreate) {
        e.preventDefault();
        add(typed);
      }
    } else if (e.key === "Escape" && expanded) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function onBlur() {
    setOpen(false);
    if (!typed) return;
    const known = options.find((o) => norm(o.name) === q);
    if (known || allowCreate) add(known?.name ?? typed);
  }

  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");
  const inputName = inputLabel ?? (hideLabel ? label : undefined);

  return (
    <div class={cx("mp-field", error && "is-invalid", className)}>
      {!hideLabel && (
        <label class="mp-field__label" id={labelId} for={inputId}>
          {label}
        </label>
      )}
      <div
        class="mp-combo"
        role="group"
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? label : undefined}
        style={error ? "box-shadow:inset 0 0 0 2px var(--alert-ink)" : undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget) localRef.current?.focus();
        }}
      >
        {value.map((name, i) => (
          <RemovablePersonChip key={name} name={name} index={i} isSelf={selfName !== undefined && norm(selfName) === norm(name)} onRemove={remove} />
        ))}
        <input
          ref={setInput}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
          aria-label={inputName}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          autocomplete="off"
          maxLength={255}
          placeholder={value.length === 0 ? placeholder : undefined}
          value={query}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setOpen(true);
            setActive(0);
          }}
        />
      </div>
      {expanded && <OptionList id={listId} label={label} items={items} active={activeIdx} query={query} onPick={pick} onHover={setActive} />}
      {hint && (
        <span class="mp-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
