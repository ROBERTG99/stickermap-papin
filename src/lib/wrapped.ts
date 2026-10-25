import { haversineMeters } from "../shared/geo";
import type { SpotFeature } from "../shared/types";
import { placedAtMs } from "../map/routes";

/** Papin Wrapped numbers (F5), computed in the browser from `/api/spots`. Pure, so they are unit tested against hand-made fixtures. */

export const MONTEVIDEO = { lat: -34.9061, lng: -56.1993 };
export const EARTH_KM = 40_075;
const DAY_MS = 86_400_000;

export interface WSpot {
  id: string;
  lat: number;
  lng: number;
  at: number;
  types: string[];
  placers: string[];
  countryCode: string | null;
  country: string | null;
  place: string | null;
  life: "unknown" | "dead" | undefined;
  diedAt: number | null;
}

export function toWSpots(features: readonly SpotFeature[]): WSpot[] {
  return features.map((f) => ({
    id: f.id, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], at: placedAtMs(f), types: f.properties.types, placers: f.properties.placers,
    countryCode: f.properties.country_code, country: f.properties.country, place: f.properties.place_name, life: f.properties.life,
    diedAt: f.properties.died ? Date.parse(f.properties.died) : null,
  }));
}

const yearOf = (ms: number) => new Date(ms).getUTCFullYear();
const monthOf = (ms: number) => new Date(ms).getUTCMonth();
const lower = (s: string) => s.toLowerCase();

export interface PersonYear {
  person: string;
  year: number;
  placed: WSpot[];
  km: number;
  countries: string[];
  newCountries: { code: string; name: string }[];
  favorite: { slug: string; count: number } | null;
  farthest: { spot: WSpot; km: number } | null;
  longest: { spot: WSpot; days: number; alive: boolean } | null;
  rank: number;
  people: number;
  rival: { name: string; gap: number } | null;
}

/** Great-circle km between consecutive placements, oldest first. */
export function kmOf(spots: readonly WSpot[]): number {
  const s = [...spots].sort((a, b) => a.at - b.at);
  let m = 0;
  for (let i = 1; i < s.length; i++) m += haversineMeters(s[i - 1]!.lat, s[i - 1]!.lng, s[i]!.lat, s[i]!.lng);
  return m / 1000;
}

export function survivalOf(spot: WSpot, now: number): { days: number; alive: boolean } {
  const end = spot.life === "dead" && spot.diedAt !== null ? spot.diedAt : now;
  return { days: Math.max(0, Math.floor((end - spot.at) / DAY_MS)), alive: spot.life !== "dead" };
}

export function personYear(all: readonly WSpot[], person: string, year: number, now = Date.now()): PersonYear {
  const key = lower(person);
  const mine = all.filter((s) => s.placers.some((p) => lower(p) === key));
  const placed = mine.filter((s) => yearOf(s.at) === year).sort((a, b) => a.at - b.at);
  const countries = [...new Set(placed.map((s) => s.countryCode).filter((c): c is string => !!c))];
  const before = new Set(mine.filter((s) => s.at < Date.UTC(year, 0, 1)).map((s) => s.countryCode).filter(Boolean));
  const newCountries = countries.filter((c) => !before.has(c)).map((code) => ({ code, name: placed.find((s) => s.countryCode === code)?.country ?? code.toUpperCase() }));

  const typeCount = new Map<string, number>();
  for (const s of placed) for (const t of s.types) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  const favorite = [...typeCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const far = placed
    .map((spot) => ({ spot, km: haversineMeters(MONTEVIDEO.lat, MONTEVIDEO.lng, spot.lat, spot.lng) / 1000 }))
    .sort((a, b) => b.km - a.km)[0];
  const long = placed
    .map((spot) => ({ spot, ...survivalOf(spot, now) }))
    .sort((a, b) => b.days - a.days)[0];

  // ranking among everyone who stuck something that year
  const perPerson = new Map<string, number>();
  for (const s of all.filter((x) => yearOf(x.at) === year)) for (const p of s.placers) perPerson.set(p, (perPerson.get(p) ?? 0) + 1);
  const board = [...perPerson.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const idx = board.findIndex(([name]) => lower(name) === key);
  const above = idx > 0 ? board[idx - 1] : undefined;

  return {
    person, year, placed, km: kmOf(placed), countries, newCountries,
    favorite: favorite ? { slug: favorite[0], count: favorite[1] } : null,
    farthest: far ? { spot: far.spot, km: far.km } : null,
    longest: long ? { spot: long.spot, days: long.days, alive: long.alive } : null,
    rank: idx >= 0 ? idx + 1 : board.length + 1, people: board.length,
    rival: above ? { name: above[0], gap: above[1] - (perPerson.get(board[idx]![0]) ?? 0) } : null,
  };
}

export interface GroupYear {
  year: number;
  total: number;
  countries: number;
  newCountries: { code: string; name: string }[];
  mvp: { name: string; count: number } | null;
  bestMonth: { month: number; count: number } | null;
  fallen: WSpot[];
}

export function groupYear(all: readonly WSpot[], year: number): GroupYear {
  const spots = all.filter((s) => yearOf(s.at) === year);
  const before = new Set(all.filter((s) => s.at < Date.UTC(year, 0, 1)).map((s) => s.countryCode).filter(Boolean));
  const codes = [...new Set(spots.map((s) => s.countryCode).filter((c): c is string => !!c))];
  const per = new Map<string, number>();
  for (const s of spots) for (const p of s.placers) per.set(p, (per.get(p) ?? 0) + 1);
  const mvp = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const months = new Array<number>(12).fill(0);
  for (const s of spots) months[monthOf(s.at)]!++;
  const best = months.reduce((bi, c, i, arr) => (c > arr[bi]! ? i : bi), 0);
  return {
    year, total: spots.length, countries: codes.length,
    newCountries: codes.filter((c) => !before.has(c)).map((code) => ({ code, name: spots.find((s) => s.countryCode === code)?.country ?? code.toUpperCase() })),
    mvp: mvp ? { name: mvp[0], count: mvp[1] } : null,
    bestMonth: spots.length ? { month: best, count: months[best]! } : null,
    fallen: all.filter((s) => s.life === "dead" && s.diedAt !== null && yearOf(s.diedAt) === year),
  };
}

/** Wrapped opens on 1 December of its year (the preview flag opens it earlier). */
export const wrappedOpensAt = (year: number): number => Date.UTC(year, 11, 1);
export const wrappedOpen = (year: number, now = Date.now(), preview = false): boolean => preview || now >= wrappedOpensAt(year);

/** "0,6 vueltas al mundo". */
export const worldLaps = (km: number): number => Math.round((km / EARTH_KM) * 10) / 10;
