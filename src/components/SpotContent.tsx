import type { PlacerStatus, SpotDetail, StickerType } from "../shared/types";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
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
  placers: string[];
  placerStatus: PlacerStatus;
  /** Who uploaded it; null is "Anónimo". */
  uploader: string | null;
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
    place: spot.place_name ?? spot.city ?? "Lugar sin nombre",
    country: spot.country,
    countryCode: spot.country_code,
    types,
    placers: spot.placers,
    placerStatus: spot.placer_status,
    uploader: spot.reporter,
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
  onReport?: () => void;
  /** "¿Sabés quién fue?" (unknown placer): the parent opens Reportar with the reason "Sé quién lo pegó". */
  onKnowPlacer?: () => void;
  onEdit?: () => void;
}

const PHOTO_FILL = "width:100%;height:100%;object-fit:cover;display:block";

function SpotPhoto({ spot, ratio }: { spot: SpotView; ratio: string }) {
  const first = spot.types[0];
  const typeName = first?.label ?? "sticker";
  if (spot.photo) {
    return (
      <div class="mp-photo" style={`--ratio:${ratio}`}>
        <img src={spot.photo} alt={`Foto: sticker ${typeName}`} style={PHOTO_FILL} loading="lazy" />
      </div>
    );
  }
  return (
    <div class={cx("mp-photo", spot.photoVariant && `mp-photo--${spot.photoVariant}`)} style={`--ratio:${ratio};--tilt:var(--tilt-1)`} role="img" aria-label={`Foto: sticker ${typeName}`}>
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
export function SpotContent({ spot, variant, me, editHoursLeft, onOpenPhoto, onShare, onReport, onKnowPlacer, onEdit }: SpotContentProps) {
  if (variant === "peek") {
    return (
      <div class="mp-spot">
        <div class="mp-spot__peek">
          <button type="button" class="mp-spot__thumb" aria-label="Ver foto" onClick={onOpenPhoto}>
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

  const unknown = spot.placers.length === 0 || spot.placerStatus === "unknown";
  const names = unknown ? [] : spot.placers;
  const written = names.map((n) => (n === me ? `${n} (vos)` : n));
  const uploader = spot.uploader === null ? "Anónimo" : spot.uploader === me ? `${spot.uploader} (vos)` : spot.uploader;

  return (
    <div class="mp-spot">
      <button type="button" class="mp-spot__thumb" aria-label="Ver foto en pantalla completa" onClick={onOpenPhoto}>
        <SpotPhoto spot={spot} ratio="4/3" />
        <span class="mp-spot__zoom">
          <Icon name="expand" />
        </span>
      </button>
      <PlaceBlock spot={spot} />
      <TypeTags types={spot.types} />
      <div class="mp-spot__by">
        {unknown ? (
          <span class="mp-avatar mp-avatar--unknown" style="--s:36px" aria-hidden="true">
            ¿?
          </span>
        ) : (
          <span class="mp-avatars">
            {names.map((n, i) => (
              <PlacerAvatar key={n} name={n} index={i} />
            ))}
          </span>
        )}
        <div>
          <span class="mp-spot__by-label">PEGADO POR</span>
          <span class="mp-spot__by-names">{unknown ? "¿?" : placersLabel(written)}</span>
        </div>
        {unknown && onKnowPlacer && (
          <button type="button" class="mp-btn mp-btn--quiet mp-btn--sm" style="margin-left:auto" onClick={onKnowPlacer}>
            ¿Sabés quién fue?
          </button>
        )}
      </div>
      <div class="mp-spot__meta">
        Cargado por: <b>{uploader}</b>
        {spot.dateLabel && ` · ${spot.dateLabel}`}
      </div>
      <div class="mp-spot__actions">
        <a class="mp-btn mp-btn--secondary" href={mapsUrl(spot)} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size="sm" />
          Ver en Google Maps
        </a>
        <button type="button" class="mp-btn mp-btn--secondary" onClick={onShare}>
          <Icon name="share" size="sm" />
          Compartir
        </button>
        <button type="button" class="mp-btn mp-btn--quiet" style="grid-column:1/-1;justify-self:start" onClick={onReport}>
          <Icon name="flag" size="sm" />
          Reportar
        </button>
      </div>
      {editHoursLeft !== undefined && (
        <div class="mp-spot__owner">
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={onEdit}>
            <Icon name="pencil" size="sm" />
            Editar
          </button>
          <small>
            <Icon name="clock" size="sm" />
            {`podés editar por ${editHoursLeft} h`}
          </small>
        </div>
      )}
    </div>
  );
}
