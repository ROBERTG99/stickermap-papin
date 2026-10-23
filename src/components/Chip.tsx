import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { cx } from "../lib/cx";
import type { StickerType } from "../shared/types";
import { Icon } from "./Icon";

/* ── Shared helpers (also used by Field and WhoPlaced) ───────────────────── */

/** Stable tilt for things (type icons, avatars, markers): `--tilt-1..4` by index % 4. Never random. */
export function tiltStyle(index: number): string {
  const n = ((Math.trunc(index) % 4) + 4) % 4;
  return `--tilt:var(--tilt-${n + 1})`;
}

/** "Ana" -> "Co", "iñaki" -> "Iñ". */
export function personInitials(name: string): string {
  const chars = Array.from(name.trim());
  const first = (chars[0] ?? "?").toUpperCase();
  const second = (chars[1] ?? "").toLowerCase();
  return first + second;
}

/** Stable avatar colour 1..6 from the name (the same person always gets the same colour). */
export function avatarVariant(name: string): number {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return (h % 6) + 1;
}

interface PersonAvatarProps {
  name: string;
  /** Diameter in px; chips and options size the avatar themselves, so usually omitted. */
  size?: number;
  /** Position in its list: picks the stable tilt. Omit for no tilt. */
  index?: number;
}

/** Initials in a coloured disc (`mp-avatar`), decorative: the name is always printed next to it. */
export function PersonAvatar({ name, size, index }: PersonAvatarProps) {
  const variant = avatarVariant(name);
  const style = [size ? `--s:${size}px` : "", index === undefined ? "" : tiltStyle(index)].filter(Boolean).join(";");
  return (
    <span class={cx("mp-avatar", variant > 1 && `mp-avatar--${variant}`)} style={style || undefined} aria-hidden="true">
      {personInitials(name)}
    </span>
  );
}

/** Type data a chip or tile needs (the API's `StickerType` satisfies it). */
export type TypeLike = Pick<StickerType, "slug" | "label" | "icon" | "fit">;

interface TypeStickerProps {
  type: TypeLike;
  /** Position in the list: picks the stable tilt. */
  index?: number;
}

/** Round type icon (`mp-sticker`); `alt=""` because the label is printed next to it. */
export function TypeSticker({ type, index }: TypeStickerProps) {
  return (
    <span class={cx("mp-sticker", type.fit === "contain" && "mp-sticker--contain")} style={index === undefined ? undefined : tiltStyle(index)}>
      <img src={type.icon} alt="" />
    </span>
  );
}

function Tick() {
  return (
    <span class="mp-chip__tick">
      <Icon name="check" />
    </span>
  );
}

/* ── Type chip ───────────────────────────────────────────────────────────── */

interface TypeChipProps {
  type: TypeLike;
  selected: boolean;
  onToggle: (slug: string) => void;
  count?: number;
  /** Defaults to `count === 0`: a type with 0 stickers in a filter is disabled but keeps its label readable. */
  disabled?: boolean;
  index?: number;
}

/** Type chip: sticker + label + optional count. Used in filters and the gallery row (lay out in `mp-chips`). */
export function TypeChip({ type, selected, onToggle, count, disabled, index }: TypeChipProps) {
  return (
    <button type="button" class="mp-chip" aria-pressed={selected} disabled={disabled ?? count === 0} onClick={() => onToggle(type.slug)}>
      <TypeSticker type={type} index={index} />
      {type.label}
      {count !== undefined && <span class="mp-chip__count">{count}</span>}
      <Tick />
    </button>
  );
}

/* ── Person chips ────────────────────────────────────────────────────────── */

interface PersonChipProps {
  name: string;
  selected: boolean;
  onToggle: (name: string) => void;
  index?: number;
  disabled?: boolean;
}

/** Person chip as a toggle (filters, "Recientes"). */
export function PersonChip({ name, selected, onToggle, index, disabled }: PersonChipProps) {
  return (
    <button type="button" class="mp-chip" aria-pressed={selected} disabled={disabled} onClick={() => onToggle(name)}>
      <PersonAvatar name={name} index={index} />
      {name}
      <Tick />
    </button>
  );
}

interface RemovablePersonChipProps {
  name: string;
  onRemove: (name: string) => void;
  /** Marks the current user: renders "Ana (vos)". */
  isSelf?: boolean;
  index?: number;
}

/** Person chip inside a combobox: avatar + name + remove button (`aria-label="Quitar Ana"`). */
export function RemovablePersonChip({ name, onRemove, isSelf, index }: RemovablePersonChipProps) {
  return (
    <span class="mp-chip">
      <PersonAvatar name={name} index={index} />
      {isSelf ? `${name} (vos)` : name}
      <button type="button" class="mp-chip__x" aria-label={`Quitar ${name}`} onClick={() => onRemove(name)}>
        <Icon name="x" />
      </button>
    </span>
  );
}

interface AddChipProps {
  onClick: () => void;
  label?: string;
}

/** "+ agregar nombre": opens the name input. */
export function AddChip({ onClick, label = "agregar nombre" }: AddChipProps) {
  return (
    <button type="button" class="mp-chip mp-chip--add" onClick={onClick}>
      <Icon name="plus" size="sm" />
      {label}
    </button>
  );
}

/* ── Filter chip, count badge, filter button ─────────────────────────────── */

interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Lowercase ISO country code: shows its flag before the label. */
  flag?: string;
  count?: number;
  disabled?: boolean;
}

/** Text-only filter chip (country with flag, date presets). */
export function FilterChip({ label, selected, onToggle, flag, count, disabled }: FilterChipProps) {
  return (
    <button type="button" class="mp-chip" aria-pressed={selected} disabled={disabled} onClick={onToggle}>
      {flag && <img class="mp-flag" src={`/flags/${flag.toLowerCase()}.svg`} alt="" />}
      {label}
      {count !== undefined && <span class="mp-chip__count">{count}</span>}
      <Tick />
    </button>
  );
}

/** Small green number badge. */
export function CountBadge({ children }: { children: ComponentChildren }) {
  return <span class="mp-countbadge">{children}</span>;
}

interface FilterButtonProps {
  /** Number of active filters; the badge only shows when > 0. */
  count: number;
  onClick: () => void;
}

/** Round "Filtros" icon button with the active-filter count. */
export function FilterButton({ count, onClick }: FilterButtonProps) {
  const label = count === 0 ? "Filtros" : count === 1 ? "Filtros, 1 activo" : `Filtros, ${count} activos`;
  return (
    <button type="button" class="mp-btn mp-btn--secondary mp-btn--icon mp-filterbtn" aria-label={label} onClick={onClick}>
      <Icon name="filter" />
      {count > 0 && <CountBadge>{count}</CountBadge>}
    </button>
  );
}

/* ── Type tile and grid (add form) ───────────────────────────────────────── */

interface TypeTileProps {
  type: TypeLike;
  selected: boolean;
  onToggle: (slug: string) => void;
  index?: number;
}

/** Big icon multi-select tile: when selected it gets a ring, a check badge and a tilted, larger icon. */
export function TypeTile({ type, selected, onToggle, index }: TypeTileProps) {
  return (
    <button type="button" class="mp-typetile" aria-pressed={selected} onClick={() => onToggle(type.slug)}>
      <span class="mp-typetile__tick">
        <Icon name="check" />
      </span>
      <TypeSticker type={type} index={index} />
      {type.label}
    </button>
  );
}

export type TypeTileOption = TypeLike & Pick<StickerType, "allows_text">;

interface TypeGridProps {
  types: readonly TypeTileOption[];
  /** Selected slugs. */
  value: readonly string[];
  onChange: (slugs: string[]) => void;
  /** Free text for the "Otro" type (shown only while a type with `allows_text` is selected). */
  otherText: string;
  onOtherTextChange: (text: string) => void;
  /** Message shown under the "¿Cuál?" input; also marks it invalid. */
  otherError?: string;
  /** Accessible name of the group. */
  label?: string;
}

/** Multi-select grid of type tiles. Picking "Otro" reveals the "¿Cuál?" input right under the grid. */
export function TypeGrid({ types, value, onChange, otherText, onOtherTextChange, otherError, label = "Tipo de sticker" }: TypeGridProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOther = useRef(false);
  const showOther = types.some((t) => t.allows_text && value.includes(t.slug));

  useEffect(() => {
    if (focusOther.current && showOther) inputRef.current?.focus();
    focusOther.current = false;
  }, [showOther]);

  function toggle(slug: string) {
    const on = value.includes(slug);
    const type = types.find((t) => t.slug === slug);
    if (!on && type?.allows_text) focusOther.current = true;
    onChange(on ? value.filter((s) => s !== slug) : [...value, slug]);
  }

  return (
    <div class="mp-stack">
      <div class="mp-typegrid" role="group" aria-label={label}>
        {types.map((t, i) => (
          <TypeTile key={t.slug} type={t} index={i} selected={value.includes(t.slug)} onToggle={toggle} />
        ))}
      </div>
      {showOther && (
        <div class={cx("mp-field", otherError && "is-invalid")}>
          <label class="mp-field__label" for={inputId}>
            ¿Cuál?
          </label>
          <input
            ref={inputRef}
            id={inputId}
            class="mp-input"
            value={otherText}
            placeholder="Ej: el de la vaca"
            aria-invalid={otherError ? "true" : undefined}
            aria-describedby={otherError ? errorId : undefined}
            onInput={(e) => onOtherTextChange(e.currentTarget.value)}
          />
          {otherError && (
            <span class="mp-field__error" id={errorId}>
              <Icon name="alert" />
              {otherError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
