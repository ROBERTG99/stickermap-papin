import type { SpotDetail, StickerType } from "../shared/types";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { InstagramLink } from "./InstagramHandle";
import { Flag, PlacerAvatar, TypeSticker, formatSpotDate, placersLabel } from "./map-parts";

/** What the spot block needs, already resolved (type slugs -> StickerType, dates -> labels). */
export interface SpotView {
  id: string;
  /** "Puerta del Sol, Madrid" */
  place: string;
  /** Country name ("España") and ISO code for the flag. */
  country: string | null;
  countryCode: string | null;
  /** Resolved types; the first one is the main one. */
  types: StickerType[];
  /** Who uploaded and stuck it (the same person); empty for anonymous spots. */
  placers: string[];
  /** Instagram handle by person name, and the spot's post/reel link (F2). */
  ig: Record<string, string>;
  igPost: string | null;
  /** Date label already formatted ("15 abr 2025" or "hace 1 h"). */
  dateLabel: string;
  /** `/img/display/<id>.webp`; null renders the placeholder photo. */
  photo: string | null;
  /** Placeholder variant (`mp-photo--<variant>`) used when there is no photo, e.g. "pole". */
  photoVariant?: string;
  lat: number;
  lng: number;
}

/** Build the view model from an API `SpotDetail` and the active type list. */
export function toSpotView(spot: SpotDetail, allTypes: StickerType[]): SpotView {
  const types = spot.types.map((slug) => allTypes.find((t) => t.slug === slug)).filter((t): t is StickerType => t !== undefined);
  return {
    id: spot.id,
    place: spot.place_name ?? spot.city ?? t("components.spot.noName"),
    country: spot.country,
    countryCode: spot.country_code,
    types,
    placers: spot.placers,
    ig: spot.ig ?? {},
    igPost: spot.ig_post ?? null,
    dateLabel: formatSpotDate(spot.taken_at ?? spot.created_at),
    photo: spot.photo,
    lat: spot.lat,
    lng: spot.lng,
  };
}

interface SpotContentProps {
  spot: SpotView;
  /** `peek` is the 176px summary (thumbnail + place + types); `full` is the whole block. */
  variant: "peek" | "full";
  /** Current user's name, to write "Ana (vos)". */
  me?: string;
  /** Hours left in the 24 h edit window; only the submitter gets "Editar". */
  editHoursLeft?: number;
  onOpenPhoto?: () => void;
  onShare?: () => void;
  /** F2: shows "Compartir en historia" (and the @handles) when the feature is on. */
  onShareStory?: () => void;
  instagram?: boolean;
  onReport?: () => void;
  onEdit?: () => void;
}

// contain: even the small peek thumbnail shows the whole photo
const PHOTO_FILL = "width:100%;height:100%;object-fit:contain;display:block;background:var(--surface-sunken)";

function SpotPhoto({ spot, ratio, natural }: { spot: SpotView; ratio: string; natural?: boolean }) {
  const first = spot.types[0];
  const typeName = first?.label ?? "sticker";
  if (spot.photo && natural) {
    // Expanded sheet / side panel: the whole photo, never cropped (it keeps its own proportions; very tall ones are letterboxed).
    return (
      <div class="mp-photo mp-photo--natural">
        <img src={spot.photo} alt={t("components.photo.alt", { type: typeName })} loading="lazy" />
      </div>
    );
  }
  if (spot.photo) {
    return (
      <div class="mp-photo" style={`--ratio:${ratio}`}>
        <img src={spot.photo} alt={t("components.photo.alt", { type: typeName })} style={PHOTO_FILL} loading="lazy" />
      </div>
    );
  }
  return (
    <div class={cx("mp-photo", spot.photoVariant && `mp-photo--${spot.photoVariant}`)} style={`--ratio:${ratio};--tilt:var(--tilt-1)`} role="img" aria-label={t("components.photo.alt", { type: typeName })}>
      {first && <TypeSticker type={first} />}
    </div>
  );
}

function PlaceBlock({ spot }: { spot: SpotView }) {
  return (
    <div>
      <h3 class="mp-spot__place">{spot.place}</h3>
      {spot.country && (
        <div class="mp-spot__country">
          {spot.countryCode && <Flag code={spot.countryCode} />} {spot.country}
        </div>
      )}
    </div>
  );
}

function TypeTags({ types }: { types: StickerType[] }) {
  return (
    <div class="mp-spot__types">
      {types.map((t) => (
        <span class="mp-tag" key={t.slug}>
          <TypeSticker type={t} />
          {t.label}
        </span>
      ))}
    </div>
  );
}

function mapsUrl(spot: SpotView): string {
  return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
}

/** The shared `mp-spot` block: same inside the mobile BottomSheet and the desktop SidePanel. */
export function SpotContent({ spot, variant, me, editHoursLeft, onOpenPhoto, onShare, onShareStory, instagram, onReport, onEdit }: SpotContentProps) {
  if (variant === "peek") {
    return (
      <div class="mp-spot">
        <div class="mp-spot__peek">
          <button type="button" class="mp-spot__thumb" aria-label={t("components.spot.viewPhoto")} onClick={onOpenPhoto}>
            <SpotPhoto spot={spot} ratio="4/5" />
          </button>
          <div style="display:grid;gap:var(--space-2)">
            <PlaceBlock spot={spot} />
            <TypeTags types={spot.types} />
          </div>
        </div>
      </div>
    );
  }

  const unknown = spot.placers.length === 0;
  const names = spot.placers;
  const written = names.map((n) => (n === me ? t("common.person.you", { name: n }) : n));

  return (
    <div class="mp-spot">
      <button type="button" class="mp-spot__thumb" aria-label={t("components.spot.viewFull")} onClick={onOpenPhoto}>
        <SpotPhoto spot={spot} ratio="4/3" natural />
        <span class="mp-spot__zoom">
          <Icon name="expand" />
        </span>
      </button>
      <PlaceBlock spot={spot} />
      <TypeTags types={spot.types} />
      <div class="mp-spot__by">
        {unknown ? (
          <span class="mp-avatar mp-avatar--unknown" style="--s:36px" aria-hidden="true">
            {t("common.person.unknownPlacer")}
          </span>
        ) : (
          <span class="mp-avatars">
            {names.map((n, i) => (
              <PlacerAvatar key={n} name={n} index={i} />
            ))}
          </span>
        )}
        <div>
          <span class="mp-spot__by-label">{t("components.spot.placedBy")}</span>
          <span class="mp-spot__by-names">{unknown ? t("common.person.unknownPlacer") : placersLabel(written)}</span>
          {instagram && names.some((n) => spot.ig[n]) && (
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-3)">
              {names.filter((n) => spot.ig[n]).map((n) => <InstagramLink key={n} handle={spot.ig[n]!} />)}
            </div>
          )}
        </div>
      </div>
      {spot.dateLabel && <div class="mp-spot__meta">{spot.dateLabel}</div>}
      <div class="mp-spot__actions">
        {instagram && onShareStory && (
          <button type="button" class="mp-btn mp-btn--primary" style="grid-column:1/-1" onClick={onShareStory}>
            <Icon name="share" size="sm" />
            {t("share.story.title")}
          </button>
        )}
        {instagram && spot.igPost && (
          <a class="mp-btn mp-btn--secondary" href={spot.igPost} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size="sm" />
            {t("components.spot.viewOnInstagram")}
          </a>
        )}
        <a class="mp-btn mp-btn--secondary" href={mapsUrl(spot)} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size="sm" />
          {t("components.spot.maps")}
        </a>
        <button type="button" class="mp-btn mp-btn--secondary" onClick={onShare}>
          <Icon name="share" size="sm" />
          {t("common.action.share")}
        </button>
        <button type="button" class="mp-btn mp-btn--quiet" style="grid-column:1/-1;justify-self:start" onClick={onReport}>
          <Icon name="flag" size="sm" />
          {t("common.action.report")}
        </button>
      </div>
      {editHoursLeft !== undefined && (
        <div class="mp-spot__owner">
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={onEdit}>
            <Icon name="pencil" size="sm" />
            {t("common.action.edit")}
          </button>
          <small>
            <Icon name="clock" size="sm" />
            {t("components.spot.editWindow", { h: editHoursLeft })}
          </small>
        </div>
      )}
    </div>
  );
}
