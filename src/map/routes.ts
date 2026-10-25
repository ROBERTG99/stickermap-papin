import { haversineMeters } from "../shared/geo";
import type { SpotFeature } from "../shared/types";

/** F5 routes: a person's stickers in date order, joined by great-circle lines. Pure helpers (no MapLibre), unit tested. */

export interface Stop {
  id: string;
  lat: number;
  lng: number;
  /** Placement time in ms (photo date, else upload date). */
  at: number;
}

export const placedAtMs = (f: SpotFeature): number => {
  const p = f.properties;
  const t = Date.parse(p.taken_at ? `${p.taken_at}${p.taken_at.endsWith("Z") ? "" : "Z"}` : p.created_at);
  return Number.isNaN(t) ? Date.parse(p.created_at) : t;
};

/** The spots a person stuck, oldest first. */
export function stopsFor(features: readonly SpotFeature[], person: string): Stop[] {
  const key = person.toLowerCase();
  return features
    .filter((f) => f.properties.placers.some((p) => p.toLowerCase() === key))
    .map((f) => ({ id: f.id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], at: placedAtMs(f) }))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Total length of the route in km: the sum of the great-circle hops between consecutive stops. */
export function routeKm(stops: readonly Stop[]): number {
  let m = 0;
  for (let i = 1; i < stops.length; i++) m += haversineMeters(stops[i - 1]!.lat, stops[i - 1]!.lng, stops[i]!.lat, stops[i]!.lng);
  return m / 1000;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Points along the great circle between two coordinates, both ends included (spherical interpolation). */
export function greatCircle(a: [number, number], b: [number, number], steps = 32): [number, number][] {
  const [lng1, lat1] = [rad(a[0]), rad(a[1])];
  const [lng2, lat2] = [rad(b[0]), rad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2));
  if (d < 1e-9) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  out[0] = a;
  out[out.length - 1] = b;
  return out;
}

/** Make longitudes continuous (…, 179, 181 instead of 179, -179) so a line crossing the antimeridian is drawn the short way. */
export function unwrapLongitudes(line: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let offset = 0;
  for (let i = 0; i < line.length; i++) {
    const [lng, lat] = line[i]!;
    if (i > 0) {
      const prev = line[i - 1]![0];
      if (lng - prev > 180) offset -= 360;
      else if (lng - prev < -180) offset += 360;
    }
    out.push([lng + offset, lat]);
  }
  return out;
}

/** The whole route as one polyline of great-circle hops, longitudes unwrapped. */
export function routeLine(stops: readonly Stop[], stepsPerHop = 32): [number, number][] {
  if (stops.length === 0) return [];
  if (stops.length === 1) return [[stops[0]!.lng, stops[0]!.lat]];
  const line: [number, number][] = [];
  for (let i = 1; i < stops.length; i++) {
    const hop = greatCircle([stops[i - 1]!.lng, stops[i - 1]!.lat], [stops[i]!.lng, stops[i]!.lat], stepsPerHop);
    line.push(...(i === 1 ? hop : hop.slice(1)));
  }
  return unwrapLongitudes(line);
}

/** The first `progress` (0-1) of a polyline by point count, ending exactly at the interpolated position (for the draw-in animation). */
export function partialLine(line: readonly [number, number][], progress: number): [number, number][] {
  if (line.length < 2 || progress >= 1) return line.slice();
  const p = Math.max(0, progress) * (line.length - 1);
  const whole = Math.floor(p);
  const head = line.slice(0, whole + 1);
  const next = line[whole + 1];
  if (next) {
    const f = p - whole;
    const from = line[whole]!;
    head.push([from[0] + (next[0] - from[0]) * f, from[1] + (next[1] - from[1]) * f]);
  }
  return head;
}

/** Colour slot (1-4) by selection order: routes differ by colour AND dash pattern, never hue alone. */
export const ROUTE_SLOTS = 4;
