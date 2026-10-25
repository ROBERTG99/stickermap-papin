const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** `15 abr 2025`: day, lowercase three-letter month, year; no "de" (design README, voice). */
export function formatDate(iso: string | number | Date, lang: "es" | "en" = "es"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${(lang === "es" ? MONTHS : MONTHS_EN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Naive EXIF local time (`2023-08-02T10:31:01`) is shown as written, not shifted by the viewer's timezone. */
export function formatNaiveDate(naive: string, lang: "es" | "en" = "es"): string {
  return formatDate(`${naive.slice(0, 10)}T12:00:00Z`, lang);
}

/** Relative under 24 h ("hace 3 h"), otherwise the date. */
export function formatWhen(iso: string, now = Date.now(), lang: "es" | "en" = "es"): string {
  const diff = now - Date.parse(iso);
  if (diff >= 0 && diff < 86_400_000) {
    const min = Math.floor(diff / 60_000);
    if (min < 1) return lang === "es" ? "recién" : "just now";
    if (min < 60) return lang === "es" ? `hace ${min} min` : `${min} min ago`;
    const h = Math.floor(min / 60);
    return lang === "es" ? `hace ${h} h` : `${h} h ago`;
  }
  return formatDate(iso, lang);
}

/** Thousands with a dot, decimals with a comma: 19609 -> "19.609", 12.4 -> "12,4". */
export function formatNumber(n: number, decimals = 0): string {
  const [int = "", frac] = n.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac ? `${grouped},${frac}` : grouped;
}

export const formatKm = (meters: number) => `${formatNumber(meters / 1000, meters < 10_000 ? 1 : 0)} km`;

/** Raw coordinates keep the point and four decimals (`-34.9061, -56.1993`). */
export const formatCoords = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

/** "Podés editar por 23 h 12 min" countdown parts. */
export function formatRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "hace 3 meses" / "3 months ago": the coarsest unit that is still a whole number (days, weeks, months, years). */
export function formatAgo(iso: string, now = Date.now(), lang: "es" | "en" = "es"): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
  if (days < 1) return lang === "es" ? "hoy" : "today";
  if (days < 14) return rtf.format(-days, "day");
  if (days < 60) return rtf.format(-Math.floor(days / 7), "week");
  if (days < 730) return rtf.format(-Math.floor(days / 30.44), "month");
  return rtf.format(-Math.floor(days / 365.25), "year");
}

/** "412 días" / "1 día". */
export const formatDays = (n: number, lang: "es" | "en" = "es"): string => (lang === "es" ? `${formatNumber(n)} ${n === 1 ? "día" : "días"}` : `${formatNumber(n)} ${n === 1 ? "day" : "days"}`);
