import { Map as MapLibreMap, Marker, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Vite's dependency pre-bundling does not copy MapLibre's worker file, so point MapLibre at it explicitly.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { formatCoords } from "../lib/format";
import { t } from "../lib/i18n";
import { prefersReducedMotion } from "../lib/media";
import { config } from "../lib/store";
import { DEFAULT_STYLE_URL, loadStyle, mapColors, SATELLITE_LAYER } from "../map/style";
import type { MapFocus } from "./state";

export interface LocationMapProps {
  /** The confirmed pin, or null while the user has not placed one (grey pin at `fallback`). */
  pin: { lat: number; lng: number } | null;
  fallback: { lat: number; lng: number; zoom: number };
  focus: MapFocus | null;
  /** Called with the new coordinates when the pin is dragged or the map is tapped. */
  onPick: (lat: number, lng: number) => void;
  /** Big desktop map: zoom buttons, locate button, satellite toggle and the coordinates badge. */
  big?: boolean;
  onLocate?: () => void;
  /** Small map: "Agrandar mapa" toggle. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  class?: string;
}

setWorkerUrl(workerUrl);

const blankStyle = (): StyleSpecification => ({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": mapColors().land || "#F1F0E8" } }] });

function pinElement(): { root: HTMLElement; head: HTMLElement } {
  const root = document.createElement("span");
  root.className = "mp-pin add-pin";
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", t("add.location.pinLabel"));
  const head = document.createElement("span");
  head.className = "mp-pin__head";
  const shadow = document.createElement("span");
  shadow.className = "mp-pin__shadow";
  root.append(head, shadow);
  return { root, head };
}

/**
 * The real mini-map of the Ubicación card: OpenFreeMap Liberty retinted with the design tokens, a draggable pin whose tip
 * is the coordinate, tap to move it, and arrow keys on the focused pin (10 px, Shift 50 px) for keyboard users.
 */
export function LocationMap({ pin, fallback, focus, onPick, big, onLocate, expanded, onToggleExpand, class: className }: LocationMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const headRef = useRef<HTMLElement | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const lastFocus = useRef<number | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const start = pin ?? fallback;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const map = new MapLibreMap({
      container: el,
      style: blankStyle(),
      center: [start.lng, start.lat],
      zoom: pin ? 16 : fallback.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: !big && coarse,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": t("add.location.gestures.desktop"),
        "CooperativeGesturesHandler.MacHelpText": t("add.location.gestures.desktop"),
        "CooperativeGesturesHandler.MobileHelpText": t("add.location.gestures.mobile"),
      },
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    const { root, head } = pinElement();
    headRef.current = head;
    const marker = new Marker({ element: root, anchor: "bottom", offset: [0, 3], draggable: true }).setLngLat([start.lng, start.lat]).addTo(map);
    markerRef.current = marker;
    marker.on("dragend", () => {
      const at = marker.getLngLat();
      onPickRef.current(at.lat, at.lng);
    });
    map.on("click", (e) => {
      if ((e.originalEvent.target as Element | null)?.closest?.(".add-pin")) return;
      onPickRef.current(e.lngLat.lat, e.lngLat.lng);
    });
    root.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 50 : 10;
      const delta: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
      const d = delta[e.key];
      if (!d) return;
      e.preventDefault();
      const p = map.project(marker.getLngLat());
      const next = map.unproject([p.x + d[0], p.y + d[1]]);
      marker.setLngLat(next);
      onPickRef.current(next.lat, next.lng);
    });

    let cancelled = false;
    loadStyle(config.value?.map_style_url || DEFAULT_STYLE_URL)
      .then((style) => { if (!cancelled) map.setStyle(style); })
      .catch(() => { if (!cancelled) setStyleFailed(true); });

    const resize = new ResizeObserver(() => map.resize());
    resize.observe(el);
    return () => {
      cancelled = true;
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // The pin follows the confirmed location; grey while there is none.
  useEffect(() => {
    const at = pin ?? fallback;
    markerRef.current?.setLngLat([at.lng, at.lat]);
    const head = headRef.current;
    if (head) head.style.background = pin ? "" : "var(--line-strong)";
    if (!pin) mapRef.current?.jumpTo({ center: [fallback.lng, fallback.lat], zoom: fallback.zoom });
  }, [pin?.lat, pin?.lng, fallback.lat, fallback.lng, fallback.zoom]);

  // A search, link, device fix or photo asked the map to go somewhere.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || lastFocus.current === focus.nonce) return;
    lastFocus.current = focus.nonce;
    map.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: prefersReducedMotion.value ? 0 : 600 });
  }, [focus?.nonce]);

  // Mounted with a pin already there (desktop/mobile switch, back from the conflict view): start centred on it.
  useEffect(() => {
    if (focus) lastFocus.current = focus.nonce;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(SATELLITE_LAYER)) return;
    map.setLayoutProperty(SATELLITE_LAYER, "visibility", satellite ? "visible" : "none");
  }, [satellite, styleFailed]);

  const toggleSatellite = () => {
    const map = mapRef.current;
    const next = !satellite;
    setSatellite(next);
    if (map?.getLayer(SATELLITE_LAYER)) map.setLayoutProperty(SATELLITE_LAYER, "visibility", next ? "visible" : "none");
  };

  return (
    <div class={className ?? "add-map"}>
      <div ref={host} class="add-map__canvas" />
      {styleFailed && <span class="add-map__note mp-attrib">{t("add.location.noBasemap")}</span>}
      <span class="mp-attrib add-map__attrib">
        <a href="https://openfreemap.org" target="_blank" rel="noopener">© OpenFreeMap</a>{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>
        {satellite && <> · <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 s2maps.eu</a></>}
      </span>
      {!big && onToggleExpand && (
        <button
          type="button"
          class="mp-btn mp-btn--secondary mp-btn--icon add-map__expand"
          aria-label={t(expanded ? "add.location.shrink" : "add.location.expand")}
          aria-pressed={expanded}
          onClick={onToggleExpand}
        >
          <Icon name="expand" />
        </button>
      )}
      {big && (
        <>
          <div class="mp-mapctl add-map__controls">
            <div class="mp-mapctl__group">
              <button type="button" class="mp-mapctl__btn" aria-label={t("add.location.zoomIn")} onClick={() => mapRef.current?.zoomIn()}>
                <Icon name="plus" />
              </button>
              <button type="button" class="mp-mapctl__btn" aria-label={t("add.location.zoomOut")} onClick={() => mapRef.current?.zoomOut()}>
                <Icon name="minus" />
              </button>
            </div>
            {onLocate && (
              <button type="button" class="mp-mapctl__btn mp-mapctl__btn--solo" aria-label={t("add.location.useMine")} onClick={onLocate}>
                <Icon name="locate" />
              </button>
            )}
            <button type="button" class="mp-sat" aria-pressed={satellite} onClick={toggleSatellite}>
              <Icon name="layers" />
              {t("add.location.satellite")}
            </button>
          </div>
          <span class="mp-badge add-map__coords">
            {t("add.location.dragHint")}
            {pin && <span class="mp-num" style={{ fontFamily: "var(--font-mono)" }}>{formatCoords(pin.lat, pin.lng)}</span>}
          </span>
        </>
      )}
    </div>
  );
}
