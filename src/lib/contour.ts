import { contours } from "d3-contour";
import type { GridMeta } from "./useDistanceGrid";

export interface ContourGeoJSON {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

/**
 * Builds a GeoJSON MultiPolygon tracing the isoline where the distance grid
 * equals `thresholdKm`. Rendered with stroke-only styling, this draws the
 * "equally far from the sea" line across the whole world.
 */
export function buildDistanceContour(
  grid: Uint16Array,
  meta: GridMeta,
  thresholdKm: number,
): ContourGeoJSON {
  const scaledThreshold = thresholdKm * meta.scale;

  // Sea cells are stored as the sentinel 65535. Reinterpreting the same bytes as
  // signed 16-bit turns that into -1, which can never reach a (positive)
  // threshold - masking sea out of the contour with a zero-copy typed array
  // view instead of allocating and filling a whole new grid-sized array.
  const land = new Int16Array(grid.buffer, grid.byteOffset, grid.length);

  const gen = contours().size([meta.width, meta.height]).thresholds([scaledThreshold]);
  const [polygon] = gen(land as unknown as number[]);

  // Grid sample (x, y) represents the cell center at
  // lon = minLon + (x + 0.5) * cellSizeLon, lat = maxLat - (y + 0.5) * cellSizeLat.
  const toLonLat = ([x, y]: number[]): number[] => {
    const lon = meta.minLon + (x + 0.5) * meta.cellSizeLon;
    const lat = meta.maxLat - (y + 0.5) * meta.cellSizeLat;
    return [lon, lat];
  };

  const coordinates = polygon.coordinates.map((poly) =>
    poly.map((ring) => ring.map(toLonLat)),
  );

  return { type: "MultiPolygon", coordinates };
}

/**
 * Returns a copy of the grid with the given lon/lat box forced to the sea
 * sentinel, so the global contour doesn't also draw its (coarser, possibly
 * wrong) version of an area covered by a local high-resolution refinement.
 */
export function maskGridBox(
  grid: Uint16Array,
  meta: GridMeta,
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
): Uint16Array {
  const masked = grid.slice();
  const colStart = Math.max(0, Math.floor((minLon - meta.minLon) / meta.cellSizeLon));
  const colEnd = Math.min(meta.width - 1, Math.ceil((maxLon - meta.minLon) / meta.cellSizeLon));
  const rowStart = Math.max(0, Math.floor((meta.maxLat - maxLat) / meta.cellSizeLat));
  const rowEnd = Math.min(meta.height - 1, Math.ceil((meta.maxLat - minLat) / meta.cellSizeLat));
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      masked[row * meta.width + col] = meta.seaSentinel;
    }
  }
  return masked;
}
