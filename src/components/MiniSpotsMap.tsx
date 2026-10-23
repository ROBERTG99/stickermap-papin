import "maplibre-gl/dist/maplibre-gl.css";
import { LngLatBounds, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "preact/hooks";
import { DEFAULT_STYLE_URL, loadStyle } from "../map/style";
import { config } from "../lib/store";

interface MiniSpotsMapProps {
  points: readonly { id: string; lat: number; lng: number }[];
  /** Tapping the map opens the full map. */
  href?: string;
  label: string;
}

/** Small non-interactive map with the exact point of each spot (brand dot with a die ring), for the person page. */
export function MiniSpotsMap({ points, href, label }: MiniSpotsMapProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || points.length === 0) return;
    let map: MapLibreMap | undefined;
    let cancelled = false;
    void loadStyle(config.value?.map_style_url ?? DEFAULT_STYLE_URL).then((style) => {
      if (cancelled) return;
      map = new MapLibreMap({ container: el, style, interactive: false, attributionControl: { compact: true }, center: [points[0]!.lng, points[0]!.lat], zoom: 2 });
      map.on("load", () => {
        map!.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: points.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) } });
        const css = getComputedStyle(document.documentElement);
        map!.addLayer({ id: "pts", type: "circle", source: "pts", paint: { "circle-radius": 5, "circle-color": css.getPropertyValue("--brand").trim(), "circle-stroke-width": 2, "circle-stroke-color": css.getPropertyValue("--die").trim() } });
        const b = new LngLatBounds();
        points.forEach((p) => b.extend([p.lng, p.lat]));
        map!.fitBounds(b, { padding: 28, maxZoom: 9, animate: false });
      });
    }).catch(() => { /* offline: the grey placeholder stays */ });
    return () => { cancelled = true; map?.remove(); };
  }, [points]);

  const map = <div ref={host} role="img" aria-label={label} style={{ position: "absolute", inset: 0, background: "var(--map-land)" }} />;
  return href ? <a class="profile__map" href={href}>{map}</a> : <div class="profile__map">{map}</div>;
}
