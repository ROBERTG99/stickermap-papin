const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 points. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Round to 3 decimals (~100 m): the "ubicación aproximada" rounding and the geocode cache key. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const geocodeKey = (lat: number, lng: number) => `${round3(lat).toFixed(3)},${round3(lng).toFixed(3)}`;
