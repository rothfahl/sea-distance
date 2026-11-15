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

  // Sea cells are masked to a value that can never reach a (positive) threshold,
  // so the traced contour only runs across land.
  const land = new Float64Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    land[i] = grid[i] === meta.seaSentinel ? -1 : grid[i];
  }

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
