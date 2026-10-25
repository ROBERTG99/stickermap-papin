import type { Feature, FeatureCollection, LineString } from "geojson";
import { Marker, type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import { partialLine, routeLine, type Stop } from "./routes";

const SOURCE = "mp-routes";
const CASING = "mp-routes-casing";
const slotLayer = (slot: number) => `mp-routes-${slot}`;

/** Dash patterns in line-width units, one per slot: solid, dashed, dotted, dash-dot (routes never differ by colour alone). */
const DASH: Record<number, number[] | undefined> = { 1: undefined, 2: [2.6, 1.7], 3: [0.6, 1.9], 4: [4, 1.5, 1, 1.5] };
const empty: FeatureCollection<LineString> = { type: "FeatureCollection", features: [] };

export interface RouteSpec {
  /** 1-4: picks the colour token (`--route-N`) and the dash pattern. */
  slot: number;
  name: string;
  stops: Stop[];
}

const routeColor = (slot: number) => getComputedStyle(document.documentElement).getPropertyValue(`--route-${slot}`).trim() || "#24701F";

/**
 * Routes on the map (F5): great-circle lines under numbered stops. The line draws in by growing its coordinate list
 * (`line-gradient` cannot be combined with dash patterns, and the dashes are what tell routes apart without colour).
 */
export class RoutesLayer {
  private routes: RouteSpec[] = [];
  private lines: [number, number][][] = [];
  private markers: Marker[] = [];
  private raf = 0;

  constructor(private readonly map: MapLibreMap) {}

  /** (Re)create the source and layers; call after every style load (a style swap wipes them). */
  ensure(): void {
    try {
      if (!this.map.getSource(SOURCE)) this.map.addSource(SOURCE, { type: "geojson", data: empty });
      if (!this.map.getLayer(CASING)) {
        this.map.addLayer({ id: CASING, type: "line", source: SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 7, "line-opacity": 0.9 } });
      }
      for (let slot = 1; slot <= 4; slot++) {
        const id = slotLayer(slot);
        const dash = DASH[slot];
        if (this.map.getLayer(id)) continue;
        this.map.addLayer({
          id, type: "line", source: SOURCE, filter: ["==", ["get", "slot"], slot], layout: { "line-cap": dash ? "butt" : "round", "line-join": "round" },
          paint: { "line-color": routeColor(slot), "line-width": 3.5, ...(dash ? { "line-dasharray": dash } : {}) },
        });
      }
      this.push(1);
    } catch {
      /* style still loading: style.load calls ensure() again */
    }
  }

  set(routes: RouteSpec[], opts: { animate: boolean }): void {
    cancelAnimationFrame(this.raf);
    this.routes = routes;
    this.lines = routes.map((r) => routeLine(r.stops));
    this.renderStops();
    this.ensure();
    if (routes.length === 0) {
      this.push(1);
      return;
    }
    if (!opts.animate) {
      this.push(1);
      return;
    }
    const start = performance.now();
    const DURATION = 1600;
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / DURATION);
      this.push(1 - (1 - f) ** 3);
      if (f < 1) this.raf = requestAnimationFrame(tick);
    };
    this.push(0);
    this.raf = requestAnimationFrame(tick);
  }

  /** The line of each route, to frame the camera on it. */
  allPoints(): [number, number][] {
    return this.lines.flat();
  }

  private push(progress: number): void {
    const features: Feature<LineString>[] = this.routes.flatMap((r, i) => {
      const coords = partialLine(this.lines[i] ?? [], progress);
      return coords.length >= 2 ? [{ type: "Feature" as const, properties: { slot: r.slot, name: r.name }, geometry: { type: "LineString" as const, coordinates: coords } }] : [];
    });
    try {
      (this.map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    } catch {
      /* style swapping */
    }
  }

  private renderStops(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
    for (const r of this.routes) {
      r.stops.forEach((s, i) => {
        // MapLibre positions the element it is given with an inline transform, so the numbered dot goes inside a plain wrapper
        const el = document.createElement("div");
        el.style.cssText = "width:24px;height:24px;pointer-events:none";
        const dot = document.createElement("span");
        dot.className = `mp-stop mp-stop--${r.slot}`;
        dot.style.cssText = "position:static;transform:none";
        dot.textContent = String(i + 1);
        dot.setAttribute("role", "img");
        dot.setAttribute("aria-label", `${r.name} ${i + 1}`);
        el.append(dot);
        this.markers.push(new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(this.map));
      });
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const m of this.markers) m.remove();
    this.markers = [];
  }
}
