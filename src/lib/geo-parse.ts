/**
 * Pure parser for the "Pegar link o coordenadas" box of the add form (BUILD.md §7.3).
 * Accepts decimal degrees (comma, semicolon or space separated, decimal point or comma), hemisphere letters
 * (`34.9 S, 56.16 W`), degrees-minutes-seconds, Google Maps links (`@lat,lng,17z`, `!3d..!4d..`, `?q=lat,lng`),
 * Apple Maps links (`ll=`), OpenStreetMap fragments and `geo:` URIs. Out-of-range values are rejected, never clamped.
 */

export type ParseFailure =
  /** Nothing to parse. */
  | "empty"
  /** A shortened link (maps.app.goo.gl, goo.gl/maps): it needs a network round trip we cannot make from the browser. */
  | "short_link"
  /** Latitude outside ±90, longitude outside ±180, or the 0,0 "null island". */
  | "out_of_range"
  /** Anything else: no coordinates found. */
  | "invalid";

export type ParseKind = "decimal" | "dms" | "google" | "apple" | "osm" | "geo";

export type ParseResult =
  | { ok: true; lat: number; lng: number; kind: ParseKind; zoom?: number }
  | { ok: false; reason: ParseFailure };

const fail = (reason: ParseFailure): ParseResult => ({ ok: false, reason });

/** Round to 6 decimals (≈ 0.1 m): enough for a sticker and keeps stored numbers tidy. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function finish(lat: number, lng: number, kind: ParseKind, zoom?: number): ParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("invalid");
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return fail("out_of_range");
  const result: ParseResult = { ok: true, lat: round6(lat), lng: round6(lng), kind };
  if (zoom !== undefined && Number.isFinite(zoom) && zoom >= 0 && zoom <= 22) result.zoom = zoom;
  return result;
}

const num = (s: string) => Number(s.replace(",", "."));

/** Unify the typographic variants people paste from notes apps, chats and web pages. */
function normalize(input: string): string {
  return input
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[º˚]/g, "°")
    .replace(/[′‘’`´]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, " ");
}

const HEMI = "NSEWO";
const hemiSign = (letter: string | undefined) => (letter && "SWO".includes(letter.toUpperCase()) ? -1 : 1);
const isLatLetter = (letter: string | undefined) => !!letter && "NS".includes(letter.toUpperCase());
const isLngLetter = (letter: string | undefined) => !!letter && "EWO".includes(letter.toUpperCase());

// ── degrees / minutes / seconds ───────────────────────────────────────────

const DMS_BODY = `(-)?(\\d{1,3})\\s*°\\s*(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*'\\s*)?(?:(\\d{1,2}(?:[.,]\\d+)?)\\s*"\\s*)?`;
/** Letter after each part (`34°54'S 56°9'W`) or none. */
const DMS_SUFFIX = new RegExp(`${DMS_BODY}([${HEMI}])?`, "gi");
/** Letter before each part (`S 34°54' W 56°9'`). */
const DMS_PREFIX = new RegExp(`([${HEMI}])\\s*${DMS_BODY}`, "gi");

function parseDms(text: string): ParseResult | null {
  if (!/['"]/.test(text) || !text.includes("°")) return null;
  const prefixed = /^[NSEWO]/i.test(text);
  const parts: { value: number; letter: string | undefined }[] = [];
  for (const m of text.matchAll(prefixed ? DMS_PREFIX : DMS_SUFFIX)) {
    const [letter, minus, deg, min, sec] = prefixed ? [m[1], m[2], m[3], m[4], m[5]] : [m[5], m[1], m[2], m[3], m[4]];
    const minutes = min ? num(min) : 0;
    const seconds = sec ? num(sec) : 0;
    if (minutes >= 60 || seconds >= 60) return fail("invalid");
    let value = Number(deg) + minutes / 60 + seconds / 3600;
    if (minus) value = -value;
    else value *= hemiSign(letter);
    parts.push({ value, letter });
  }
  if (parts.length !== 2) return fail("invalid");
  let [a, b] = parts as [(typeof parts)[number], (typeof parts)[number]];
  if (isLngLetter(a.letter) || isLatLetter(b.letter)) [a, b] = [b, a];
  return finish(a.value, b.value, "dms");
}

// ── decimal degrees ───────────────────────────────────────────────────────

const NUMBER = "[+-]?\\d+(?:[.,]\\d+)?";
/** Hemisphere letter after each number (`34.9 S, 56.16 W`) or none at all. */
const DECIMAL_SUFFIX = new RegExp(`^(${NUMBER})\\s*°?\\s*([${HEMI}])?\\s*[,;\\s]\\s*(${NUMBER})\\s*°?\\s*([${HEMI}])?$`, "i");
/** Hemisphere letter before each number (`S 34.9 W 56.16`). */
const DECIMAL_PREFIX = new RegExp(`^([${HEMI}])\\s*(${NUMBER})\\s*°?\\s*[,;\\s]\\s*([${HEMI}])\\s*(${NUMBER})\\s*°?$`, "i");

function parseDecimal(text: string): ParseResult | null {
  let a: string;
  let b: string;
  let letterA: string | undefined;
  let letterB: string | undefined;
  const suffix = DECIMAL_SUFFIX.exec(text);
  const prefix = suffix ? null : DECIMAL_PREFIX.exec(text);
  if (suffix) [, a = "", letterA, b = "", letterB] = suffix;
  else if (prefix) [, letterA, a = "", letterB, b = ""] = prefix;
  else return null;
  let first = { value: num(a) * (/^[+-]/.test(a) ? 1 : hemiSign(letterA)), letter: letterA };
  let second = { value: num(b) * (/^[+-]/.test(b) ? 1 : hemiSign(letterB)), letter: letterB };
  if (isLngLetter(first.letter) || isLatLetter(second.letter)) [first, second] = [second, first];
  return finish(first.value, second.value, "decimal");
}

/** `"-34.9, -56.16"`, `"34.9 S 56.16 W"`, `"34°54'21.6\"S 56°9'41.5\"W"`. */
export function parseCoordinates(input: string): ParseResult {
  const text = normalize(input);
  if (!text) return fail("empty");
  return parseDms(text) ?? parseDecimal(text) ?? fail("invalid");
}

// ── links ─────────────────────────────────────────────────────────────────

const LATLNG = "(-?\\d{1,3}(?:\\.\\d+)?)";

/** Coordinates inside a query value such as `q=-34.9,-56.16`, `q=loc:-34.9,-56.16` or `ll=-34.9%2C-56.16`. */
function fromQueryValue(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const m = new RegExp(`^(?:loc:)?\\s*${LATLNG}\\s*[,;\\s]\\s*${LATLNG}\\s*$`).exec(value.trim());
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

function parseGoogle(url: URL, raw: string): ParseResult {
  // The pin of a place link is `!3d<lat>!4d<lng>`; the `@lat,lng` is only where the map was centred.
  const place = new RegExp(`!3d${LATLNG}!4d${LATLNG}`).exec(raw);
  const view = new RegExp(`@${LATLNG},${LATLNG}(?:,(\\d+(?:\\.\\d+)?)(z|m|a))?`).exec(raw);
  const zoom = view?.[4] === "z" ? Number(view[3]) : undefined;
  if (place) return finish(Number(place[1]), Number(place[2]), "google", zoom);
  for (const key of ["q", "query", "ll", "center", "destination", "daddr", "saddr"]) {
    const at = fromQueryValue(url.searchParams.get(key));
    if (at) return finish(at.lat, at.lng, "google", zoom ?? (url.searchParams.has("z") ? Number(url.searchParams.get("z")) : undefined));
  }
  if (view) return finish(Number(view[1]), Number(view[2]), "google", zoom);
  return fail("invalid");
}

function parseApple(url: URL): ParseResult {
  for (const key of ["ll", "coordinate", "sll", "q", "center", "daddr"]) {
    const at = fromQueryValue(url.searchParams.get(key));
    if (at) return finish(at.lat, at.lng, "apple");
  }
  return fail("invalid");
}

function parseOsm(url: URL): ParseResult {
  const lat = url.searchParams.get("mlat");
  const lng = url.searchParams.get("mlon");
  if (lat && lng) return finish(Number(lat), Number(lng), "osm");
  const hash = new RegExp(`map=(\\d{1,2})/${LATLNG}/${LATLNG}`).exec(url.hash);
  return hash ? finish(Number(hash[2]), Number(hash[3]), "osm", Number(hash[1])) : fail("invalid");
}

const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.co|app\.goo\.gl)$/i;

function parseLink(text: string): ParseResult | null {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol === "geo:") {
    const m = new RegExp(`^${LATLNG},${LATLNG}`).exec(url.pathname);
    return m ? finish(Number(m[1]), Number(m[2]), "geo", url.searchParams.has("z") ? Number(url.searchParams.get("z")) : undefined) : fail("invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.co" || host === "app.goo.gl") return fail("short_link");
  if (GOOGLE_HOST.test(host)) return parseGoogle(url, text);
  if (host === "maps.apple.com" || host === "maps.apple") return parseApple(url);
  if (/(^|\.)openstreetmap\.org$/.test(host)) return parseOsm(url);
  return null;
}

/**
 * What the paste box accepts: a link (Google Maps, Apple Maps, OpenStreetMap, `geo:`) or plain coordinates.
 * Never throws; failures say why so the form can tell the user what to do.
 */
export function parseLocationText(input: string): ParseResult {
  const text = normalize(input);
  if (!text) return fail("empty");
  const asCoordinates = parseCoordinates(text);
  if (asCoordinates.ok) return asCoordinates;
  const asLink = parseLink(text);
  if (asLink) return asLink;
  return asCoordinates.reason === "out_of_range" ? asCoordinates : fail("invalid");
}
