import { MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { createMarkerElement } from "../../components/MapMarker";
import { t } from "../../lib/i18n";
import { config } from "../../lib/store";
import { DEFAULT_STYLE_URL, SATELLITE_LAYER, loadStyle } from "../../map/style";
import type { IconFit } from "../../shared/types";

interface PinMapProps {
  spotId: string;
  lat: number;
  lng: number;
  /** Icon, fit and accessible label of the first type, for the draggable marker. */
  iconUrl: string;
  fit: IconFit;
  label: string;
  /** The admin let go of the pin somewhere else. */
  onMove: (lat: number, lng: number) => void;
}

/** Retinted base map with one draggable marker: drag the pin to fix the exact coordinate (Page10Admin 9b). */
export default function PinMap({ spotId, lat, lng, iconUrl, fit, label, onMove }: PinMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const start = useRef({ lat, lng });
  start.current = { lat, lng };
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [satellite, setSatellite] = useState(false);

  // One map for the whole queue: selecting another spot only moves the marker.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        const style = await loadStyle(config.value?.map_style_url || DEFAULT_STYLE_URL);
        if (cancelled || !box.current) return;
        map = new MapLibreMap({ container: box.current, style, center: [start.current.lng, start.current.lat], zoom: 13, attributionControl: { compact: true } });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // A fresh marker per spot (new icon, new tilt).
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    const el = createMarkerElement({ id: spotId, types: [label], iconUrl, fit, selected: true, label: t("admin.map.dragHint") });
    const marker = new Marker({ element: el, anchor: "bottom", offset: [0, 4], draggable: true }).setLngLat([start.current.lng, start.current.lat]).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      moveRef.current(p.lat, p.lng);
    });
    markerRef.current = marker;
    map.jumpTo({ center: [start.current.lng, start.current.lat], zoom: 13 });
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [status, spotId, iconUrl, fit, label]);

  // Coordinates changed from outside (G, typed coordinates, undo): follow them.
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) return;
    const at = marker.getLngLat();
    if (Math.abs(at.lat - lat) < 1e-9 && Math.abs(at.lng - lng) < 1e-9) return;
    marker.setLngLat([lng, lat]);
    map.easeTo({ center: [lng, lat], duration: 400 });
  }, [lat, lng, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map?.getLayer(SATELLITE_LAYER)) return;
    map.setLayoutProperty(SATELLITE_LAYER, "visibility", satellite ? "visible" : "none");
  }, [satellite, status]);

  return (
    <div class="mp-review__map">
      <div ref={box} class="mp-review__canvas" />
      {status === "loading" && <div class="mp-review__maphint">{t("admin.map.loading")}</div>}
      {status === "error" && (
        <div class="mp-review__maphint" role="alert">
          <Icon name="wifi-off" />
          {t("admin.map.error")}
        </div>
      )}
      {status === "ready" && (
        <>
          <span class="mp-badge mp-review__draghint">
            <Icon name="pin" />
            {t("admin.map.dragHint")}
          </span>
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm mp-review__sat" aria-pressed={satellite} onClick={() => setSatellite((v) => !v)}>
            <Icon name="layers" size="sm" />
            {t("admin.map.satellite")}
          </button>
        </>
      )}
    </div>
  );
}
