import type { GridMeta } from "./useDistanceGrid";

/**
 * Bilinearly samples the distance grid at (lon, lat), in km. This must be used
 * as the contour threshold for whatever point the user clicked, so the traced
 * isoline (which is built from the same grid) passes exactly through that
 * point instead of through wherever the nearest grid cell happens to sit.
 *
 * Sea cells are excluded from the interpolation (their sentinel value would
 * otherwise contaminate the result near the coast); returns null if the point
 * has no nearby land data at all.
 */
export function sampleGridKm(grid: Uint16Array, meta: GridMeta, lon: number, lat: number): number | null {
  const fx = (lon - meta.minLon) / meta.cellSizeLon - 0.5;
  const fy = (meta.maxLat - lat) / meta.cellSizeLat - 0.5;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  const clampX = (x: number) => Math.min(meta.width - 1, Math.max(0, x));
  const clampY = (y: number) => Math.min(meta.height - 1, Math.max(0, y));

  const corners = [
    { x: clampX(x0), y: clampY(y0), w: (1 - tx) * (1 - ty) },
    { x: clampX(x0 + 1), y: clampY(y0), w: tx * (1 - ty) },
    { x: clampX(x0), y: clampY(y0 + 1), w: (1 - tx) * ty },
    { x: clampX(x0 + 1), y: clampY(y0 + 1), w: tx * ty },
  ];

  let weightSum = 0;
  let valueSum = 0;
  for (const c of corners) {
    const raw = grid[c.y * meta.width + c.x];
    if (raw === meta.seaSentinel) continue;
    weightSum += c.w;
    valueSum += c.w * raw;
  }

  if (weightSum === 0) return null;
  return valueSum / weightSum / meta.scale;
}
