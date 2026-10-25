import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { createClusterElement, createMarkerElement, setMarkerSelected } from "../components/MapMarker";
import type { SpotFeature, StickerType } from "../shared/types";
import { config } from "../lib/store";
import { markerSpec } from "./spot-view";

/**
 * HTML markers kept in sync with the clustered GeoJSON source.
 *
 * Clusters exist only up to z5 (`clusterMaxZoom: 5`, `clusterRadius: 40`); from z6 every spot is its own marker whose
 * 8px dot sits exactly on the coordinate (`anchor: "bottom"`, `offset: [0, 4]`). Overlap is allowed, nothing is hidden by
 * collision. ~160 spots make DOM markers cheap and keep the CSS exact; above ~2,000 spots switch to a symbol layer with
 * `icon-allow-overlap` and pre-rendered marker images instead of one DOM node per spot.
 */
export const SPOTS_SOURCE = "spots";
/** Invisible circle layer on the source: MapLibre only loads tiles for sources a layer uses, and it lets us ask what is on screen. */
export const SPOTS_LAYER = "spots-hit";
export const CLUSTER_MAX_ZOOM = 5;
export const CLUSTER_RADIUS = 40;

export interface MarkerHost {
  /** Spots currently in the source (the filtered set), by id. */
  spots(): ReadonlyMap<string, SpotFeature>;
  /** Every spot, by id (the selected one is always drawn, even if the filters hide it). */
  allSpots(): ReadonlyMap<string, SpotFeature>;
  types(): ReadonlyMap<string, StickerType>;
  selectedId(): string | null;
  onSpotClick(id: string): void;
  onClusterClick(clusterId: number, lngLat: [number, number]): void;
}

/** F1: the play badge shows only while the feature is on. */
const hasVideo = (spot: SpotFeature): boolean => spot.properties.v !== undefined && config.value?.features.video === true;

/** F4: only while the feature is on. */
const lifeOf = (spot: SpotFeature): "unknown" | "dead" | undefined => (config.value?.features.sightings === true ? spot.properties.life : undefined);

interface Entry {
  marker: Marker;
  el: HTMLElement;
  /** Everything that needs a rebuild of the element when it changes. */
  sig: string;
}

/** How far outside the viewport (px) markers are kept, so panning does not pop. */
const VIEW_MARGIN_PX = 240;

export class MarkerLayer {
  private entries = new Map<string, Entry>();

  constructor(private readonly map: MapLibreMap, private readonly host: MarkerHost) {}

  /** Re-read the source and add / move / remove markers. Cheap enough to call on every `moveend`. */
  sync(): void {
    const zoom = this.map.getZoom();
    const detailed = Math.floor(zoom) > 5; // z6+: no clusters
    const small = zoom < 6; // lone spots at world / continent zoom get the 32px head
    const spots = this.host.spots();
    interface Wanted { key: string; kind: "spot" | "cluster"; lng: number; lat: number; spot?: SpotFeature; clusterId?: number; count?: number }
    const wanted = new Map<string, Wanted>();

    // What the source draws right now (its ideal tiles only: querySourceFeatures would also return stale parent tiles
    // and show a cluster twice). A margin around the viewport keeps panning from popping markers in.
    const canvas = this.map.getCanvas();
    const margin = VIEW_MARGIN_PX;
    if (!this.map.getLayer(SPOTS_LAYER)) return; // style swapping: the next sync (style.load / idle) fills in
    let rendered: ReturnType<MapLibreMap["queryRenderedFeatures"]> = [];
    try {
      rendered = this.map.queryRenderedFeatures(
        [[-margin, -margin], [canvas.clientWidth + margin, canvas.clientHeight + margin]],
        { layers: [SPOTS_LAYER] },
      );
    } catch {
      return;
    }
    for (const f of rendered) {
      if (f.geometry.type !== "Point") continue;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      if (props.cluster) {
        if (detailed) continue;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const clusterId = Number(props.cluster_id);
        const count = Number(props.point_count);
        wanted.set(`c:${clusterId}:${count}`, { key: `c:${clusterId}:${count}`, kind: "cluster", lng, lat, clusterId, count });
        continue;
      }
      const spot = spots.get(String(props.id ?? ""));
      if (!spot) continue;
      const [lng, lat] = spot.geometry.coordinates; // the exact stored point, not the tile-quantised one
      wanted.set(`s:${spot.id}`, { key: `s:${spot.id}`, kind: "spot", lng, lat, spot });
    }

    const selectedId = this.host.selectedId();
    if (selectedId && !wanted.has(`s:${selectedId}`)) {
      const spot = this.host.allSpots().get(selectedId);
      if (spot) wanted.set(`s:${selectedId}`, { key: `s:${selectedId}`, kind: "spot", lng: spot.geometry.coordinates[0], lat: spot.geometry.coordinates[1], spot });
    }

    for (const [key, entry] of this.entries) {
      if (!wanted.has(key)) {
        entry.marker.remove();
        this.entries.delete(key);
      }
    }

    const types = this.host.types();
    for (const w of wanted.values()) {
      const spec = w.spot ? markerSpec(w.spot, types) : null;
      const sig = w.spot && spec ? `${spec.iconUrl}|${spec.fit}|${w.spot.properties.n}|${w.spot.properties.place_name ?? ""}|${spec.labels.join(",")}|${hasVideo(w.spot)}|${lifeOf(w.spot)}` : `${w.count}`;
      let entry = this.entries.get(w.key);
      if (entry && entry.sig !== sig) {
        entry.marker.remove();
        this.entries.delete(w.key);
        entry = undefined;
      }
      if (!entry) entry = this.create(w.key, w, sig);
      entry.marker.setLngLat([w.lng, w.lat]);
      if (w.spot) {
        entry.el.classList.toggle("mp-marker--sm", small && w.spot.id !== selectedId);
        setMarkerSelected(entry.el, w.spot.id === selectedId);
      }
    }
  }

  /** Cheap re-style of the selected state (no source read). */
  setSelected(selectedId: string | null): void {
    for (const [key, entry] of this.entries) if (key.startsWith("s:")) setMarkerSelected(entry.el, key === `s:${selectedId}`);
  }

  /** Drop every marker (the type list changed: icons must be rebuilt). */
  clear(): void {
    for (const entry of this.entries.values()) entry.marker.remove();
    this.entries.clear();
  }

  destroy(): void {
    this.clear();
  }

  private create(key: string, w: { kind: "spot" | "cluster"; lng: number; lat: number; spot?: SpotFeature; clusterId?: number; count?: number }, sig: string): Entry {
    let el: HTMLElement;
    let marker: Marker;
    if (w.kind === "cluster" && w.clusterId !== undefined) {
      const clusterId = w.clusterId;
      el = createClusterElement(w.count ?? 0);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const at = this.entries.get(key)?.marker.getLngLat();
        this.host.onClusterClick(clusterId, at ? [at.lng, at.lat] : [w.lng, w.lat]);
      });
      marker = new Marker({ element: el });
    } else {
      const spot = w.spot as SpotFeature;
      const spec = markerSpec(spot, this.host.types());
      el = createMarkerElement({
        id: spot.id,
        types: spec.labels,
        iconUrl: spec.iconUrl,
        fit: spec.fit,
        n: spot.properties.n,
        label: spot.properties.place_name,
        video: hasVideo(spot),
        life: lifeOf(spot),
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.host.onSpotClick(spot.id);
      });
      marker = new Marker({ element: el, anchor: "bottom", offset: [0, 4] });
    }
    el.classList.add("map-marker--enter");
    el.addEventListener("animationend", () => el.classList.remove("map-marker--enter"), { once: true });
    marker.setLngLat([w.lng, w.lat]).addTo(this.map);
    const entry = { marker, el, sig };
    this.entries.set(key, entry);
    return entry;
  }
}
