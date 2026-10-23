import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, LngLatBoundsLike, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { useEffect, useRef, useState } from "preact/hooks";
import { createClusterElement, createMarkerElement, setMarkerSelected } from "../../components/MapMarker";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";
import { config, types } from "../../lib/store";
import { DEFAULT_STYLE_URL, loadStyle } from "../../map/style";

type MapLib = typeof import("maplibre-gl");

export interface MapPoint { id: string; lat: number; lng: number; typeSlug: string | null }

const WORLD = { lng: 10, lat: 25, zoom: 1.4 };

/** MapLibre and the retinted style load on demand (the bulk page is the only place besides the main map that needs them). */
async function createMap(container: HTMLElement, opts: { center?: { lat: number; lng: number } | null; zoom?: number; cooperative?: boolean }): Promise<{ ml: MapLib; map: MlMap }> {
  const [ml, style] = await Promise.all([import("maplibre-gl"), loadStyle(config.value?.map_style_url || DEFAULT_STYLE_URL)]);
  const map = new ml.Map({
    container,
    style,
    center: opts.center ? [opts.center.lng, opts.center.lat] : [WORLD.lng, WORLD.lat],
    zoom: opts.zoom ?? (opts.center ? 12 : WORLD.zoom),
    attributionControl: { compact: true },
    cooperativeGestures: opts.cooperative ?? false,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": t("bulk.map.gestureCtrl"),
      "CooperativeGesturesHandler.MacHelpText": t("bulk.map.gestureCmd"),
      "CooperativeGesturesHandler.MobileHelpText": t("bulk.map.gestureTouch"),
    },
  });
  const ro = new ResizeObserver(() => map.resize());
  ro.observe(container);
  map.once("remove", () => ro.disconnect());
  return { ml, map };
}

function boundsOf(points: readonly { lat: number; lng: number }[]): LngLatBoundsLike | null {
  if (points.length === 0) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng); east = Math.max(east, p.lng);
    south = Math.min(south, p.lat); north = Math.max(north, p.lat);
  }
  return [[west, south], [east, north]];
}

function typeFor(slug: string | null) {
  const list = types.value;
  return list.find((x) => x.slug === slug) ?? list[0] ?? null;
}

interface BatchMapProps {
  points: readonly MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Refit the view when this changes (the points alone do not move the camera after the first fit). */
  fitKey?: string | number;
  label: string;
  class?: string;
  children?: preact.ComponentChildren;
}

/** Every located photo as a sticker marker, clusters up to z5 like the main map. */
export function BatchMap({ points, selectedId, onSelect, fitKey, label, class: className, children }: BatchMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ map: MlMap; ml: MapLib; markers: Map<string, { marker: MlMarker; el: HTMLElement }>; ready: boolean } | null>(null);
  const latest = useRef({ points, selectedId, onSelect, fitKey });
  latest.current = { points, selectedId, onSelect, fitKey };
  const [failed, setFailed] = useState(false);
  const fitted = useRef<string | number | undefined | null>(null);

  const collection = (list: readonly MapPoint[]) => ({
    type: "FeatureCollection" as const,
    features: list.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, typeSlug: p.typeSlug } })),
  });

  const syncMarkers = () => {
    const l = live.current;
    if (!l?.ready || !l.map.getSource("batch")) return;
    const seen = new Set<string>();
    for (const f of l.map.querySourceFeatures("batch")) {
      const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string; typeSlug?: string | null };
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const key = props.cluster ? `c${props.cluster_id}` : `p${props.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (l.markers.has(key)) continue;
      let el: HTMLElement;
      if (props.cluster) {
        el = createClusterElement(props.point_count ?? 0);
        const clusterId = props.cluster_id!;
        el.addEventListener("click", () => {
          void (l.map.getSource("batch") as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => l.map.easeTo({ center: coords, zoom }));
        });
      } else {
        const ty = typeFor(props.typeSlug ?? null);
        el = createMarkerElement({ id: props.id!, types: [ty?.label ?? ""], iconUrl: ty?.icon ?? "/img/icons/papa.png", fit: ty?.fit ?? "contain", small: true });
        const id = props.id!;
        el.addEventListener("click", () => latest.current.onSelect?.(id));
        setMarkerSelected(el, id === latest.current.selectedId);
      }
      const marker = new l.ml.Marker({ element: el, anchor: props.cluster ? "center" : "bottom", offset: props.cluster ? [0, 0] : [0, 4] }).setLngLat(coords).addTo(l.map);
      l.markers.set(key, { marker, el });
    }
    for (const [key, m] of l.markers) {
      if (!seen.has(key)) {
        m.marker.remove();
        l.markers.delete(key);
      }
    }
  };

  const fit = () => {
    const l = live.current;
    const b = boundsOf(latest.current.points);
    if (l && b) l.map.fitBounds(b, { padding: 56, maxZoom: 16, duration: 0 });
  };

  useEffect(() => {
    let disposed = false;
    const el = host.current;
    if (!el) return;
    createMap(el, { cooperative: !isDesktop.value })
      .then(({ ml, map }) => {
        if (disposed) { map.remove(); return; }
        const state = { map, ml, markers: new Map<string, { marker: MlMarker; el: HTMLElement }>(), ready: false };
        live.current = state;
        const start = () => {
          map.addSource("batch", { type: "geojson", data: collection(latest.current.points), cluster: true, clusterMaxZoom: 5, clusterRadius: 50 });
          state.ready = true;
          if (latest.current.points.length > 0) { fit(); fitted.current = latest.current.fitKey; }
          map.on("render", syncMarkers);
        };
        if (map.isStyleLoaded()) start(); else map.once("load", start);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      live.current?.map.remove();
      live.current = null;
    };
  }, []);

  // New or moved points: replace the data and rebuild the markers (cluster ids change with the data).
  useEffect(() => {
    const l = live.current;
    if (!l?.ready) return;
    (l.map.getSource("batch") as GeoJSONSource | undefined)?.setData(collection(points));
    for (const m of l.markers.values()) m.marker.remove();
    l.markers.clear();
    if (fitted.current === null && points.length > 0) { fit(); fitted.current = fitKey; }
    syncMarkers();
  }, [points]);

  useEffect(() => {
    if (fitted.current !== null && fitted.current !== fitKey) { fit(); fitted.current = fitKey; }
  }, [fitKey]);

  useEffect(() => {
    const l = live.current;
    if (!l) return;
    for (const [key, m] of l.markers) setMarkerSelected(m.el, key === `p${selectedId}`);
    const p = points.find((x) => x.id === selectedId);
    if (p && !l.map.getBounds().contains([p.lng, p.lat])) l.map.easeTo({ center: [p.lng, p.lat] });
  }, [selectedId]);

  return (
    <div class={cx("bulk-map", className)} role="group" aria-label={label}>
      <div ref={host} class="bulk-map__canvas" />
      {failed && <p class="bulk-map__fail">{t("bulk.map.unavailable")}</p>}
      {children}
    </div>
  );
}

interface PinMapProps {
  pin: { lat: number; lng: number } | null;
  /** Where to look while there is no pin yet (the rest of the batch). */
  center: { lat: number; lng: number } | null;
  onPin: (lat: number, lng: number) => void;
}

/** The mini-map of the "Ubicar" sheet: tap it or drag the pin; the page moves it for search, pasted links and suggestions. */
export function PinMap({ pin, center, onPin }: PinMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ map: MlMap; marker: MlMarker } | null>(null);
  const latest = useRef({ pin, onPin });
  latest.current = { pin, onPin };
  const fromMap = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const el = host.current;
    if (!el) return;
    createMap(el, { center: pin ?? center, zoom: pin ? 16 : center ? 11 : undefined })
      .then(({ ml, map }) => {
        if (disposed) { map.remove(); return; }
        const pinEl = document.createElement("span");
        pinEl.className = "mp-pin";
        pinEl.innerHTML = '<span class="mp-pin__head"></span><span class="mp-pin__shadow"></span>';
        const marker = new ml.Marker({ element: pinEl, anchor: "bottom", draggable: true });
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLngLat();
          fromMap.current = true;
          latest.current.onPin(lat, lng);
        });
        map.on("click", (e) => {
          fromMap.current = true;
          marker.setLngLat(e.lngLat);
          latest.current.onPin(e.lngLat.lat, e.lngLat.lng);
        });
        live.current = { map, marker };
        const p = latest.current.pin;
        if (p) marker.setLngLat([p.lng, p.lat]).addTo(map);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      live.current?.map.remove();
      live.current = null;
    };
  }, []);

  useEffect(() => {
    const l = live.current;
    if (!l) return;
    if (!pin) { l.marker.remove(); return; }
    l.marker.setLngLat([pin.lng, pin.lat]).addTo(l.map);
    if (!fromMap.current) l.map.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(l.map.getZoom(), 16), duration: 400 });
    fromMap.current = false;
  }, [pin?.lat, pin?.lng]);

  return (
    <div class="bulk-map bulk-map--pin">
      <div ref={host} class="bulk-map__canvas" />
      {!pin && !failed && <p class="bulk-map__tap">{t("bulk.locate.tap")}</p>}
      {failed && <p class="bulk-map__fail">{t("bulk.map.unavailable")}</p>}
    </div>
  );
}
