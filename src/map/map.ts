import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
// Vite's dependency pre-bundling does not copy MapLibre's worker file, so point MapLibre at it explicitly.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { SpotFeature, StickerType } from "../shared/types";
import { storage } from "../lib/local";
import { computeBounds } from "./filters";
import { NO_PADDING, samePadding, type Padding } from "./layout";
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, MarkerLayer, SPOTS_LAYER, SPOTS_SOURCE } from "./markers";
import { mapColors, SATELLITE_LAYER } from "./style";

/**
 * The imperative MapLibre side of the map page: one map, one clustered GeoJSON source, HTML markers on top.
 * The page (Preact) owns what is selected / filtered and tells this class; this class tells the page what was tapped.
 */

export interface MapView {
  center: [number, number];
  zoom: number;
}

export interface StickerMapCallbacks {
  onSpotClick(id: string): void;
  /** A tap on the bare map (not on a marker). */
  onBackgroundClick(): void;
  /** The user stopped moving the map and no spot is selected: remember the viewport. */
  onViewChange(view: MapView): void;
}

setWorkerUrl(workerUrl);

const VIEW_KEY = "mapView";
const WORLD_VIEW: MapView = { center: [-30, 22], zoom: 1.4 };

export const loadSavedView = (): MapView | null => {
  const v = storage.get<MapView | null>(VIEW_KEY, null);
  return v && Array.isArray(v.center) && v.center.length === 2 && v.center.every(Number.isFinite) && Number.isFinite(v.zoom) ? v : null;
};
export const saveView = (view: MapView): void => storage.set(VIEW_KEY, view);

const emptyCollection: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Liberty paints a few areas with sprite patterns (pedestrian hatching, wetlands) that ignore the retint: use the plain fill colour. */
function withoutFillPatterns(layers: StyleSpecification["layers"]): StyleSpecification["layers"] {
  return layers.map((l) => {
    if (l.type !== "fill" || !l.paint || !("fill-pattern" in l.paint)) return l;
    const { "fill-pattern": _pattern, ...paint } = l.paint;
    return { ...l, paint };
  });
}

/** The clustered source + an invisible layer (MapLibre only loads tiles for sources that a layer uses). */
function withSpots(style: StyleSpecification, data: FeatureCollection, satellite: boolean): StyleSpecification {
  return {
    ...style,
    sources: {
      ...style.sources,
      [SPOTS_SOURCE]: { type: "geojson", data, cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_MAX_ZOOM },
    },
    layers: [
      ...withoutFillPatterns(style.layers).map((l) => (l.id === SATELLITE_LAYER ? { ...l, layout: { ...(l.layout ?? {}), visibility: satellite ? "visible" : "none" } } : l)),
      { id: SPOTS_LAYER, type: "circle", source: SPOTS_SOURCE, paint: { "circle-radius": 1, "circle-opacity": 0 } },
    ] as StyleSpecification["layers"],
  };
}

/** Land-coloured, label-less style: what the map shows until (or without) the real tiles. */
function blankStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": mapColors().land || "#ECEEE8" } }] };
}

export class StickerMap {
  readonly map: MapLibreMap;
  private markers: MarkerLayer;
  private all = new Map<string, SpotFeature>();
  private shown = new Map<string, SpotFeature>();
  private data: FeatureCollection = emptyCollection;
  private typeMap: ReadonlyMap<string, StickerType> = new Map();
  private selected: string | null = null;
  private satellite = false;
  private baseStyle: StyleSpecification | null = null;
  private padding: Padding = NO_PADDING;
  private me: Marker | null = null;
  private destroyed = false;
  private viewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(container: HTMLElement, private readonly cb: StickerMapCallbacks, view: MapView | null) {
    const start = view ?? WORLD_VIEW;
    this.map = new MapLibreMap({
      container,
      style: withSpots(blankStyle(), emptyCollection, false),
      center: start.center,
      zoom: start.zoom,
      maxZoom: 19,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
      fadeDuration: 0,
    });
    // test hook (e2e compares marker dots with map.project): harmless read-only handle
    (window as unknown as { __mapaPapinMap?: MapLibreMap }).__mapaPapinMap = this.map;
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();

    this.markers = new MarkerLayer(this.map, {
      spots: () => this.shown,
      allSpots: () => this.all,
      types: () => this.typeMap,
      selectedId: () => this.selected,
      onSpotClick: (id) => this.cb.onSpotClick(id),
      onClusterClick: (clusterId, lngLat) => void this.zoomIntoCluster(clusterId, lngLat),
    });

    const sync = () => {
      if (!this.destroyed) this.markers.sync();
    };
    this.map.on("sourcedata", (e) => {
      if (e.sourceId === SPOTS_SOURCE && e.isSourceLoaded) sync();
    });
    this.map.on("moveend", sync);
    this.map.on("zoomend", sync);
    this.map.on("idle", sync);
    this.map.on("style.load", () => {
      this.pushData();
      this.applySatellite();
      sync();
    });
    this.map.on("click", (e) => {
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(".mp-marker, .mp-cluster")) return;
      this.cb.onBackgroundClick();
    });
    this.map.on("moveend", () => {
      clearTimeout(this.viewTimer);
      this.viewTimer = setTimeout(() => {
        if (this.destroyed || this.selected) return;
        const c = this.map.getCenter();
        this.cb.onViewChange({ center: [c.lng, c.lat], zoom: this.map.getZoom() });
      }, 400);
    });
  }

  // ── data ────────────────────────────────────────────────────────────────

  /** Every spot (lookup for the always-drawn selected marker and for the exact coordinates). */
  setAllSpots(features: readonly SpotFeature[]): void {
    this.all = new Map(features.map((f) => [f.id, f]));
  }

  /** The (filtered) spots drawn: they become the clustered source. */
  setData(features: readonly SpotFeature[]): void {
    this.shown = new Map(features.map((f) => [f.id, f]));
    this.data = { type: "FeatureCollection", features: features as unknown as Feature[] };
    this.pushData();
  }

  private pushData(): void {
    try {
      (this.map.getSource(SPOTS_SOURCE) as GeoJSONSource | undefined)?.setData(this.data);
    } catch {
      /* style swapping: style.load pushes the data again */
    }
  }

  setTypes(types: ReadonlyMap<string, StickerType>): void {
    this.typeMap = types;
    this.markers.clear();
    this.markers.sync();
  }

  // ── style ───────────────────────────────────────────────────────────────

  /** Swap in the retinted base style (null = offline: keep the empty land background). Markers survive. */
  applyStyle(base: StyleSpecification | null): void {
    if (this.destroyed) return;
    this.baseStyle = base;
    this.map.setStyle(withSpots(base ?? blankStyle(), this.data, this.satellite), { diff: false });
  }

  setSatellite(on: boolean): void {
    this.satellite = on;
    this.applySatellite();
  }

  private applySatellite(): void {
    try {
      if (this.map.getLayer(SATELLITE_LAYER)) this.map.setLayoutProperty(SATELLITE_LAYER, "visibility", this.satellite ? "visible" : "none");
    } catch {
      /* style still loading: style.load applies it */
    }
  }

  // ── camera ──────────────────────────────────────────────────────────────

  /** Frame every spot (first open without a remembered viewport). */
  fitToSpots(features: readonly SpotFeature[], padding: Padding): void {
    const bounds = computeBounds(features);
    if (!bounds) return;
    this.map.fitBounds(bounds, { padding: { ...padding, top: padding.top + 24, bottom: padding.bottom + 24, left: padding.left + 24, right: padding.right + 24 }, maxZoom: 12, duration: 0 });
  }

  /** Select a spot: its marker grows, the padding keeps the dot clear of the sheet / panel, the camera eases to it. */
  focus(lngLat: [number, number], opts: { padding: Padding; zoom?: number; animate: boolean }): void {
    const duration = opts.animate ? 600 : 0;
    this.padding = opts.padding;
    const target: { center: [number, number]; padding: Padding; zoom?: number; duration: number; essential: boolean } = { center: lngLat, padding: opts.padding, duration, essential: false };
    if (opts.zoom !== undefined) target.zoom = opts.zoom;
    if (opts.zoom !== undefined && opts.animate && Math.abs(opts.zoom - this.map.getZoom()) > 2) this.map.flyTo({ ...target, duration: 1200 });
    else this.map.easeTo(target);
  }

  /** Release the padding (nothing selected). The point under the old padded centre stays put as far as possible. */
  clearPadding(animate: boolean): void {
    if (samePadding(this.padding, NO_PADDING)) return;
    this.padding = NO_PADDING;
    this.map.easeTo({ padding: NO_PADDING, duration: animate ? 350 : 0 });
  }

  setSelected(id: string | null): void {
    this.selected = id;
    this.markers.sync();
    this.markers.setSelected(id);
  }

  flyToPlace(p: { lng: number; lat: number; bbox: [number, number, number, number] | null }, animate: boolean): void {
    if (p.bbox && p.bbox[0] !== p.bbox[2]) {
      this.map.fitBounds([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]], { padding: 48, maxZoom: 15, duration: animate ? 1200 : 0 });
    } else {
      this.map.flyTo({ center: [p.lng, p.lat], zoom: 14, duration: animate ? 1200 : 0, essential: false });
    }
  }

  private async zoomIntoCluster(clusterId: number, lngLat: [number, number]): Promise<void> {
    try {
      const source = this.map.getSource(SPOTS_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      const expansion = await source.getClusterExpansionZoom(clusterId);
      const zoom = Math.min(Math.max(expansion, this.map.getZoom() + 1), 19);
      this.map.easeTo({ center: lngLat, zoom, duration: 500 });
    } catch {
      this.map.easeTo({ center: lngLat, zoom: this.map.getZoom() + 2, duration: 500 });
    }
  }

  zoomBy(delta: number): void {
    this.map.easeTo({ zoom: this.map.getZoom() + delta, duration: 250 });
  }

  /** Show / move the "you are here" dot and centre on it. */
  showMe(lngLat: [number, number], animate: boolean): void {
    if (!this.me) {
      const el = document.createElement("span");
      el.className = "map-me";
      el.setAttribute("aria-hidden", "true");
      this.me = new Marker({ element: el }).setLngLat(lngLat).addTo(this.map);
    } else {
      this.me.setLngLat(lngLat);
    }
    this.map.flyTo({ center: lngLat, zoom: Math.max(this.map.getZoom(), 14), duration: animate ? 1200 : 0, essential: false });
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.viewTimer);
    this.markers.destroy();
    this.me?.remove();
    this.map.remove();
  }
}
