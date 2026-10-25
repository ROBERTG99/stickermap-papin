import { lazy, Suspense } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import type { AdminSpot, SpotPatch } from "../../admin/api";
import { reasonMeta } from "../../admin/reasons";
import { adminPeople, adminTypes } from "../../admin/state";
import { parseCoords } from "../../admin/text";
import { formatAgo } from "../../admin/util";
import { Badge } from "../../components/Badge";
import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { TypeChip } from "../../components/Chip";
import { Combobox, TextField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { sourceMeta } from "../../components/LocationPicker";
import { formatCoords, formatNaiveDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import { PlaceCell, ReasonBadges, StatusBadge, TypeStickers, typeBySlug } from "./parts";

const PinMap = lazy(() => import("./PinMap"));

export interface SpotEditorProps {
  spot: AdminSpot;
  gpsBusy: boolean;
  onPatch: (body: SpotPatch) => void;
  onMove: (lat: number, lng: number) => void;
  onApprove: () => void;
  onHide: () => void;
  onDelete: () => void;
  onGps: () => void;
  onShowBatch: (id: string) => void;
  onHideBatch: (id: string) => void;
}

const KEYS: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ["A"], label: "admin.keys.approve" },
  { keys: ["O"], label: "admin.keys.hide" },
  { keys: ["B"], label: "admin.keys.delete" },
  { keys: ["J", "K"], label: "admin.keys.next" },
  { keys: ["G"], label: "admin.keys.gps" },
  { keys: ["/"], label: "admin.keys.search" },
  { keys: ["?"], label: "admin.keys.help" },
];

/** The shortcut legend, always visible (never only a tooltip). */
export function KeysLegend() {
  return (
    <div class="mp-keys" aria-label={t("admin.keys.label")}>
      {KEYS.map((k) => (
        <span key={k.label}>
          {k.keys.map((key) => (
            <kbd key={key} class="mp-kbd">
              {key}
            </kbd>
          ))}
          {t(k.label)}
        </span>
      ))}
    </div>
  );
}

function Photo({ spot }: { spot: AdminSpot }) {
  const first = typeBySlug.value.get(spot.types[0] ?? "");
  if (!spot.photo) {
    return (
      <div class="mp-review__photo mp-review__photo--none">
        <Icon name="image" size="lg" />
        <b>{t("admin.review.noPhoto")}</b>
        <span class="mp-field__hint">{spot.legacy_filename ? t("admin.review.legacyFile", { name: spot.legacy_filename }) : t("admin.review.noPhotoHint")}</span>
      </div>
    );
  }
  return (
    <a class="mp-review__photo" href={spot.photo} target="_blank" rel="noopener" aria-label={t("admin.review.openPhoto", { type: first?.label ?? "" })}>
      <img src={spot.photo} alt="" decoding="async" />
    </a>
  );
}

/** Detail of the selected spot: photo and map side by side, reasons, editable types and person, and the moderation buttons. */
export function SpotEditor(props: SpotEditorProps) {
  const { spot, gpsBusy, onPatch, onMove, onApprove, onHide, onDelete, onGps, onShowBatch, onHideBatch } = props;
  const types = adminTypes.value;
  const first = typeBySlug.value.get(spot.types[0] ?? "");
  const [coords, setCoords] = useState(formatCoords(spot.lat, spot.lng));
  const [coordsError, setCoordsError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCoords(formatCoords(spot.lat, spot.lng));
    setCoordsError("");
    setDirty(false);
  }, [spot.id, spot.lat, spot.lng]);

  const commitCoords = () => {
    if (!dirty) return;
    const parsed = parseCoords(coords);
    if (!parsed) {
      setCoordsError(t("admin.review.coordsError"));
      return;
    }
    setCoordsError("");
    setDirty(false);
    if (Math.abs(parsed.lat - spot.lat) > 1e-6 || Math.abs(parsed.lng - spot.lng) > 1e-6) onMove(parsed.lat, parsed.lng);
  };

  const toggleType = (slug: string) => {
    const next = spot.types.includes(slug) ? spot.types.filter((x) => x !== slug) : [...spot.types, slug];
    if (next.length === 0) {
      toast.show({ kind: "error", message: t("admin.review.needOneType") });
      return;
    }
    onPatch({ types: next });
  };

  const source = sourceMeta(spot.location_source);
  const unlisted = spot.types.filter((slug) => !types.some((x) => x.slug === slug));
  const trashed = spot.status === "hidden" && spot.review_reasons.includes("deleted");

  return (
    <article class="mp-review__editor" aria-label={t("admin.review.detail")}>
      <header class="mp-review__title">
        <h2 class="mp-card__title">
          <PlaceCell spot={spot} />
        </h2>
        <StatusBadge spot={spot} />
        <ReasonBadges reasons={spot.review_reasons} />
        <span class="mp-field__hint">{formatAgo(spot.created_at)}</span>
      </header>

      <div class="mp-review__pair">
        <Photo spot={spot} />
        <Suspense fallback={<div class="mp-review__map"><Skeleton height="100%" radius={16} /></div>}>
          <PinMap spotId={spot.id} lat={spot.lat} lng={spot.lng} iconUrl={first?.icon ?? "/img/icons/papa.png"} fit={first?.fit ?? "contain"} label={first?.label ?? t("admin.review.sticker")} onMove={onMove} />
        </Suspense>
      </div>

      {spot.review_reasons.map((code) => {
        const m = reasonMeta(code);
        if (code === "deleted") return null;
        return (
          <Banner key={code} kind={m.variant === "alert" || m.variant === "solid" ? "error" : "info"} icon={m.icon}>
            {t(m.help, { code })}
          </Banner>
        );
      })}

      {(spot.note || spot.other_text) && (
        <dl class="mp-review__notes">
          {spot.note && (
            <>
              <dt>{t("admin.review.note")}</dt>
              <dd>{spot.note}</dd>
            </>
          )}
          {spot.other_text && (
            <>
              <dt>{t("admin.review.otherText")}</dt>
              <dd>{spot.other_text}</dd>
            </>
          )}
        </dl>
      )}

      {spot.batch_id && (
        <div class="mp-banner mp-banner--countdown mp-review__batch">
          <Icon name="layers" />
          <span>{t("admin.review.batch", { id: spot.batch_id.slice(-6).toUpperCase() })}</span>
          <span class="mp-review__batchbtns">
            <Button size="sm" variant="secondary" onClick={() => onShowBatch(spot.batch_id!)}>
              {t("admin.review.showBatch")}
            </Button>
            <Button size="sm" variant="secondary" icon="eye-off" onClick={() => onHideBatch(spot.batch_id!)}>
              {t("admin.review.hideBatch")}
            </Button>
          </span>
        </div>
      )}

      <div class="mp-review__fields">
        <div class="mp-field">
          <span class="mp-field__label" id="rv-types">
            {t("admin.review.types")}
          </span>
          <div class="mp-chips" role="group" aria-labelledby="rv-types">
            {types
              .filter((x) => x.is_active || spot.types.includes(x.slug))
              .map((x, i) => (
                <TypeChip key={x.slug} type={x} index={i} selected={spot.types.includes(x.slug)} onToggle={toggleType} />
              ))}
            {unlisted.map((slug) => (
              <Badge key={slug}>{slug}</Badge>
            ))}
          </div>
        </div>
        <Combobox
          label={t("admin.review.placers")}
          options={adminPeople.value.map((p) => ({ name: p.name, count: p.placed }))}
          value={spot.reporter ? [spot.reporter] : []}
          onChange={(names) => onPatch({ reporter: names[0] ?? null })}
          multiple={false}
          allowCreate
          placeholder={t("admin.review.placersPlaceholder")}
          hint={!spot.reporter ? t("admin.review.placersUnknown") : undefined}
        />
      </div>

      <div class="mp-review__coords">
        <TextField
          label={t("admin.review.coords")}
          mono
          value={coords}
          error={coordsError || undefined}
          hint={t("admin.review.coordsHint")}
          onInput={(e) => {
            setCoords((e.currentTarget as HTMLInputElement).value);
            setDirty(true);
          }}
          onBlur={commitCoords}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitCoords();
            }
          }}
        />
        <Button variant="secondary" icon="camera" loading={gpsBusy} disabled={!spot.has_original} onClick={onGps}>
          {gpsBusy ? t("admin.review.gpsBusy") : t("admin.review.gps")}
        </Button>
        {spot.has_original && (
          <a class="mp-btn mp-btn--quiet" href={`/api/admin/spots/${encodeURIComponent(spot.id)}/original`} download>
            <Icon name="download" />
            {t("admin.review.original")}
          </a>
        )}
      </div>

      <p class="mp-spot__meta mp-review__meta">
        {t("admin.review.by")} <b>{spot.reporter ?? t("common.person.anonymous")}</b> · {spot.taken_at ? formatNaiveDate(spot.taken_at) : formatAgo(spot.created_at)} ·{" "}
        <span class="mp-review__mono">{formatCoords(spot.lat, spot.lng)}</span> ·{" "}
        <span class="mp-review__source">
          <Icon name={source.icon} size="sm" /> {source.label}
        </span>
        {spot.is_approximate && <> · {t("admin.review.approx")}</>}
        {spot.types.length > 0 && <TypeStickers slugs={spot.types} size={22} />}
      </p>

      <KeysLegend />

      <div class="mp-review__actions">
        <Button variant="primary" icon="check" onClick={onApprove}>
          {t(trashed ? "admin.review.restore" : "admin.review.approve")}
        </Button>
        <Button variant="secondary" icon="eye-off" onClick={onHide} disabled={spot.status === "hidden" && !trashed}>
          {t("admin.review.hide")}
        </Button>
        <span class="mp-adminhead__spacer" />
        <Button variant="danger-ghost" icon="trash" onClick={onDelete} disabled={trashed}>
          {t("admin.review.delete")}
        </Button>
      </div>
    </article>
  );
}
