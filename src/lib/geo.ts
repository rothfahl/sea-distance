// Shared geo math used both by the offline data-generation script and the client app.

export const KM_PER_DEG_LAT = 111.32;
const R = 6371.0088;

export function kmPerDegLon(latDeg: number): number {
  return KM_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Angular great-circle distance between two points, in radians. */
function angularDist(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(clamp(Math.sqrt(a), -1, 1));
}

/** Initial bearing from point 1 to point 2, in radians. */
function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/** Destination point from (lon, lat), travelling angular distance `delta` (radians) along `theta` bearing (radians). */
function destination(lon: number, lat: number, delta: number, theta: number): { lon: number; lat: number } {
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);
  const phi2 = Math.asin(
    clamp(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta), -1, 1),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lon: toDeg(lambda2), lat: toDeg(phi2) };
}

export interface SegmentHit {
  distanceKm: number;
  lon: number;
  lat: number;
}

/**
 * Distance (km) from point P to great-circle segment A-B, and the closest
 * point on it, using proper spherical cross-track/along-track math (not a
 * flat-plane approximation, which breaks down over long distances - notably
 * near the poles, where a single longitude-to-km scale factor stops being
 * valid across the span between a query point and a far-away segment).
 */
export function pointToSegmentKm(
  plon: number,
  plat: number,
  alon: number,
  alat: number,
  blon: number,
  blat: number,
): SegmentHit {
  const d12 = angularDist(alon, alat, blon, blat);
  if (d12 < 1e-12) {
    // Degenerate (zero-length) segment: distance to point A.
    return { distanceKm: haversineKm(plon, plat, alon, alat), lon: alon, lat: alat };
  }

  const d13 = angularDist(alon, alat, plon, plat);
  const theta13 = bearing(alon, alat, plon, plat);
  const theta12 = bearing(alon, alat, blon, blat);

  const dXt = Math.asin(clamp(Math.sin(d13) * Math.sin(theta13 - theta12), -1, 1));
  const dAt = Math.acos(clamp(Math.cos(d13) / Math.cos(dXt), -1, 1));

  if (dAt <= 0) {
    return { distanceKm: haversineKm(plon, plat, alon, alat), lon: alon, lat: alat };
  }
  if (dAt >= d12) {
    return { distanceKm: haversineKm(plon, plat, blon, blat), lon: blon, lat: blat };
  }

  const closest = destination(alon, alat, dAt, theta12);
  return { distanceKm: Math.abs(dXt) * R, lon: closest.lon, lat: closest.lat };
}

/** Normalizes a longitude into [-180, 180). */
export function normLon(lon: number): number {
  let l = lon % 360;
  if (l < -180) l += 360;
  if (l >= 180) l -= 360;
  return l;
}
