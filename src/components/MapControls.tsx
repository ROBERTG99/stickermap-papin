import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

interface MapControlsProps {
  /** Satellite raster is on (button turns inverse). */
  satellite: boolean;
  onToggleSatellite: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Centre on the user; the browser asks for permission on the first tap only. */
  onLocate: () => void;
  /** A location request is in flight. */
  locating?: boolean;
  class?: string;
}

/** Floating map controls: zoom +/-, locate, Satélite toggle. Replaces MapLibre's NavigationControl. */
export function MapControls({ satellite, onToggleSatellite, onZoomIn, onZoomOut, onLocate, locating, class: className }: MapControlsProps) {
  return (
    <div class={cx("mp-mapctl", className)}>
      <div class="mp-mapctl__group">
        <button type="button" class="mp-mapctl__btn" aria-label={t("components.mapctl.zoomIn")} onClick={onZoomIn}>
          <Icon name="plus" />
        </button>
        <button type="button" class="mp-mapctl__btn" aria-label={t("components.mapctl.zoomOut")} onClick={onZoomOut}>
          <Icon name="minus" />
        </button>
      </div>
      <button type="button" class="mp-mapctl__btn mp-mapctl__btn--solo" aria-label={t("components.mapctl.locate")} aria-busy={locating ? "true" : undefined} onClick={onLocate}>
        <Icon name="locate" />
      </button>
      <button type="button" class="mp-sat" aria-pressed={satellite} onClick={onToggleSatellite}>
        <Icon name="layers" />
        {t("components.mapctl.satellite")}
      </button>
    </div>
  );
}

/** Attribution, bottom-right, always visible; satellite adds its source. */
export function MapAttribution({ satellite, class: className }: { satellite?: boolean; class?: string }) {
  return (
    <span class={cx("mp-attrib", className)}>
      {satellite ? "© EOX Sentinel-2 · © OpenStreetMap" : "© OpenFreeMap © OpenStreetMap"}
    </span>
  );
}
