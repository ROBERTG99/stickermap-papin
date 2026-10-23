/** Pure text helpers of the admin (no DOM, no i18n): unit-tested in tests/unit/admin-helpers.test.ts. */
import { formatNumber } from "../lib/format";

/** 76835292 -> "73,3 MB"; 10737418240 -> "10 GB". Binary units, decimal comma. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const decimals = i === 0 || value >= 100 || Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1;
  return `${formatNumber(Math.round(value * 10 ** decimals) / 10 ** decimals, decimals)} ${units[i]}`;
}

/** "Sexo? OG" -> "sexo-og": lowercase, accents stripped, anything else becomes a dash. */
export function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Parse "-34.9061, -56.1993" (also with a semicolon or a space). Null when it is not a valid pair. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** The place a spot is listed under: its name, else its coordinates. */
export function placeLabel(spot: { place_name: string | null; country: string | null; lat: number; lng: number }): string {
  if (spot.place_name) return spot.place_name;
  if (spot.country) return spot.country;
  return `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
}

/** Group strings case-insensitively, keeping the most common spelling: [{ text: "Vaca", count: 14 }]. */
export function groupCounts(values: readonly string[]): { text: string; count: number }[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const raw of values) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), count: 0 };
    g.count++;
    g.spellings.set(text, (g.spellings.get(text) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ text: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0], count: g.count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "es"));
}
