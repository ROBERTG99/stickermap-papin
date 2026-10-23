import { computed } from "@preact/signals";
import type { ComponentChildren, Ref } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Avatar, AvatarGroup } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Combobox } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { TypeSticker } from "../../components/map-parts";
import { reasonMeta } from "../../admin/reasons";
import type { AdminSpot, AdminType } from "../../admin/api";
import { adminPeople, adminTypes } from "../../admin/state";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { Modal } from "./Modal";

/** Top bar of a section: title, then the section's actions on the right. */
export function PageHead({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <header class="mp-adminhead">
      <h1>{title}</h1>
      <span class="mp-adminhead__spacer" />
      {children}
    </header>
  );
}

export const typeBySlug = computed(() => new Map(adminTypes.value.map((x) => [x.slug, x])));

/** `value` after it stopped changing for `ms` (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return out;
}

/** Compact search field of the admin toolbars (`mp-search--compact`). */
export function SearchBox({ value, onInput, label, placeholder, inputRef, class: className }: {
  value: string;
  onInput: (value: string) => void;
  label: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  class?: string;
}) {
  return (
    <label class={cx("mp-search mp-search--compact mp-admin-search", className)}>
      <Icon name="search" />
      <input
        ref={inputRef}
        class="mp-input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autocomplete="off"
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onInput("");
          }
        }}
      />
    </label>
  );
}

/** Photo thumbnail of a spot, or the sticker of its first type on the placeholder when there is no photo. */
export function SpotThumb({ spot, class: className }: { spot: Pick<AdminSpot, "thumb" | "types">; class?: string }) {
  const first = typeBySlug.value.get(spot.types[0] ?? "");
  return (
    <div class={cx("mp-photo mp-photo--brick", className)} style="--ratio:1/1" role="img" aria-label={first ? `${t("admin.photo.of")} ${first.label}` : t("admin.photo.none")}>
      {spot.thumb ? <img class="mp-admin-img" src={spot.thumb} alt="" loading="lazy" decoding="async" /> : first && <TypeSticker type={first} />}
    </div>
  );
}

/** The types of a spot as small overlapping stickers. */
export function TypeStickers({ slugs, size = 26 }: { slugs: readonly string[]; size?: number }) {
  const map = typeBySlug.value;
  return (
    <span class="mp-admin-stickers" style={`--s:${size}px`}>
      {slugs.map((slug, i) => {
        const type = map.get(slug);
        return type ? <TypeSticker key={slug} type={type} tilt={`var(--tilt-${(i % 4) + 1})`} class="mp-sticker--thin" /> : <span key={slug} class="mp-badge">{slug}</span>;
      })}
    </span>
  );
}

/** Avatars + names of who stuck it, or the unknown placer. */
export function PlacerCell({ spot }: { spot: Pick<AdminSpot, "placers"> }) {
  if (spot.placers.length === 0) {
    return (
      <span class="mp-admin-person">
        <Avatar name={null} size={28} />
        {t("person.unknownPlacer")}
      </span>
    );
  }
  return (
    <span class="mp-admin-person">
      <AvatarGroup names={spot.placers} size={28} />
      {spot.placers.join(", ")}
    </span>
  );
}

export function ReasonBadge({ code }: { code: string }) {
  const m = reasonMeta(code);
  return (
    <Badge variant={m.variant} icon={m.icon}>
      {m.label ? t(m.label) : code}
    </Badge>
  );
}

export function ReasonBadges({ reasons }: { reasons: readonly string[] }) {
  return (
    <>
      {reasons.map((code) => (
        <ReasonBadge key={code} code={code} />
      ))}
    </>
  );
}

export const isTrashed = (s: Pick<AdminSpot, "status" | "review_reasons">) => s.status === "hidden" && s.review_reasons.includes("deleted");

/** published = brand, waiting for review = alert, hidden or in the trash = inverse (design 9c). */
export function StatusBadge({ spot }: { spot: Pick<AdminSpot, "status" | "needs_review" | "review_reasons"> }) {
  if (isTrashed(spot)) return <Badge variant="inverse" icon="trash">{t("admin.status.trash")}</Badge>;
  if (spot.status === "hidden") return <Badge variant="inverse" icon="eye-off">{t("admin.status.hidden")}</Badge>;
  if (spot.status === "pending") return <Badge variant="alert" icon="clock">{t("admin.status.pending")}</Badge>;
  if (spot.needs_review) return <Badge variant="alert">{t("admin.status.review")}</Badge>;
  return <Badge variant="brand">{t("admin.status.published")}</Badge>;
}

/** One-line "Madrid, España" for a spot, with its flag. */
export function PlaceCell({ spot }: { spot: Pick<AdminSpot, "place_name" | "country" | "country_code" | "lat" | "lng"> }) {
  const main = spot.place_name ?? spot.country ?? `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
  return (
    <span class="mp-admin-place">
      {spot.country_code && <img class="mp-flag" src={`/flags/${spot.country_code.toLowerCase()}.svg`} alt="" loading="lazy" />}
      <span class={cx(!spot.place_name && "mp-admin-muted")}>{main}</span>
    </span>
  );
}

/** "Asignar a…": pick (or create) the people who stuck the selected spots, then confirm. Bulk `assign_placers`. */
export function AssignPlacersDialog({ open, count, busy, onClose, onAssign }: {
  open: boolean;
  count: number;
  busy?: boolean;
  onClose: () => void;
  onAssign: (names: string[]) => void;
}) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (open) setNames([]);
  }, [open]);
  return (
    <Modal
      open={open}
      title={t("admin.assign.title")}
      onClose={onClose}
      actions={
        <>
          <Button variant="primary" icon="users" loading={busy} disabled={names.length === 0} onClick={() => onAssign(names)}>
            {busy ? t("admin.assign.busy") : t("admin.assign.confirm", { n: count })}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
        </>
      }
    >
      <p class="mp-dialog__body">{t("admin.assign.body", { n: count })}</p>
      <Combobox
        label={t("admin.assign.label")}
        options={adminPeople.value.map((p) => ({ name: p.name, count: p.placed }))}
        value={names}
        onChange={setNames}
        allowCreate
        maxItems={10}
        placeholder={t("admin.assign.placeholder")}
        hint={t("admin.assign.hint")}
      />
    </Modal>
  );
}

/** Screen-reader-visible text that is not shown. */
export const SrOnly = ({ children }: { children: ComponentChildren }) => <span class="mp-sr">{children}</span>;

export type { AdminType };
