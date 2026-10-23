import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * OpenFreeMap "Liberty" retinted with the design system's `map-*` tokens so the stickers are the only colourful things
 * on screen (design README, "The map"). POI icons only show from z15. A "Satélite" raster layer (EOX Sentinel-2 cloudless,
 * CC-BY 4.0) sits under the labels and is toggled with `setSatellite`.
 */
export const SATELLITE_LAYER = "satellite";
export const SATELLITE_ATTRIBUTION =
  'Sentinel-2 cloudless – <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)';

export interface MapColors {
  land: string; water: string; park: string; road: string; roadCasing: string; building: string; border: string; label: string;
}

/** Read the live token values so light/dark and any future token change flow into the map. */
export function mapColors(root: HTMLElement = document.documentElement): MapColors {
  const cs = getComputedStyle(root);
  const v = (name: string) => cs.getPropertyValue(`--${name}`).trim();
  return {
    land: v("map-land"), water: v("map-water"), park: v("map-park"), road: v("map-road"), roadCasing: v("map-road-casing"),
    building: v("map-building"), border: v("map-border"), label: v("map-label"),
  };
}

type Paint = Record<string, unknown>;

function retintLayer(layer: LayerSpecification, c: MapColors): LayerSpecification {
  const id = layer.id;
  const paint: Paint = { ...((layer as { paint?: Paint }).paint ?? {}) };
  const out = { ...layer, paint } as LayerSpecification & { paint: Paint; layout?: Record<string, unknown>; minzoom?: number };

  if (layer.type === "background") paint["background-color"] = c.land;
  else if (layer.type === "raster") out.layout = { ...out.layout, visibility: "none" };
  else if (layer.type === "fill-extrusion") out.layout = { ...out.layout, visibility: "none" };
  else if (layer.type === "fill") {
    if (id === "water") paint["fill-color"] = c.water;
    else if (id === "building") paint["fill-color"] = c.building;
    else if (/^(park|landcover_(wood|grass|wetland)|landuse_(pitch|track|cemetery))$/.test(id)) paint["fill-color"] = c.park;
    else if (id.startsWith("aeroway")) paint["fill-color"] = c.building;
    else paint["fill-color"] = c.land; // residential, ice, sand, school, hospital, road areas
  } else if (layer.type === "line") {
    if (id.startsWith("waterway")) paint["line-color"] = c.water;
    else if (id === "park_outline") paint["line-color"] = c.park;
    else if (id.startsWith("boundary")) paint["line-color"] = c.border;
    else if (/casing$/.test(id)) paint["line-color"] = c.roadCasing;
    else if (/rail|aeroway/.test(id)) paint["line-color"] = c.border;
    else paint["line-color"] = c.road;
  } else if (layer.type === "symbol") {
    if ("text-color" in paint || "text-halo-color" in paint) {
      paint["text-color"] = c.label;
      paint["text-halo-color"] = c.land;
    }
    if (id.startsWith("poi_")) out.minzoom = Math.max(out.minzoom ?? 0, 15);
  }
  return out;
}

export function retint(style: StyleSpecification, colors: MapColors): StyleSpecification {
  const layers = style.layers.map((l) => retintLayer(l, colors));
  const firstSymbol = layers.findIndex((l) => l.type === "symbol");
  const satellite: LayerSpecification = { id: SATELLITE_LAYER, type: "raster", source: SATELLITE_LAYER, layout: { visibility: "none" } };
  layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, satellite);
  return {
    ...style,
    sources: {
      ...style.sources,
      [SATELLITE_LAYER]: {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 14,
        attribution: SATELLITE_ATTRIBUTION,
      },
    },
    layers,
  };
}

/** Fetch the style JSON (URL comes from the `map_style_url` setting) and retint it. Rejects when offline. */
export async function loadStyle(styleUrl: string, colors: MapColors = mapColors()): Promise<StyleSpecification> {
  const res = await fetch(styleUrl);
  if (!res.ok) throw new Error(`style ${res.status}`);
  return retint((await res.json()) as StyleSpecification, colors);
}

export const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
