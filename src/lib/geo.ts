// Shared geo math used both by the offline data-generation script and the client app.
// Uses a local equirectangular projection around the query point, which is accurate
// enough for nearest-coastline-segment queries (segments are short relative to Earth's radius).

export const KM_PER_DEG_LAT = 111.32;

export function kmPerDegLon(latDeg: number): number {
  return KM_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface SegmentHit {
  distanceKm: number;
  lon: number;
  lat: number;
}

/**
 * Distance (km) from point P to segment A-B, and the closest point on it,
 * using a local tangent-plane projection centered at P.
 */
export function pointToSegmentKm(
  plon: number,
  plat: number,
  alon: number,
  alat: number,
  blon: number,
  blat: number,
): SegmentHit {
  const kLon = kmPerDegLon(plat);
  const kLat = KM_PER_DEG_LAT;

  const ax = (alon - plon) * kLon;
  const ay = (alat - plat) * kLat;
  const bx = (blon - plon) * kLon;
  const by = (blat - plat) * kLat;

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;

  let t = lenSq > 0 ? (-ax * abx - ay * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const distanceKm = Math.sqrt(cx * cx + cy * cy);

  const lon = plon + cx / kLon;
  const lat = plat + cy / kLat;

  return { distanceKm, lon, lat };
}

/** Normalizes a longitude into [-180, 180). */
export function normLon(lon: number): number {
  let l = lon % 360;
  if (l < -180) l += 360;
  if (l >= 180) l -= 360;
  return l;
}
