import { contours } from "d3-contour";
import { pointToSegmentKm, kmPerDegLon, KM_PER_DEG_LAT } from "./geo";
import type { CoastIndex } from "./coastIndex";
import type { ContourGeoJSON } from "./contour";

export interface LocalContourResult {
  geojson: ContourGeoJSON;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

// The global precomputed grid (0.1deg cells) is far too coarse for small
// islands and narrow peninsulas - a 20km island can span just two or three
// cells, so its traced isoline comes out blocky and can even produce
// disconnected artifact loops that don't pass through the clicked point.
// This rebuilds just the area around the click, at this resolution, directly
// from the exact coastline segments (the same ones used for the per-click
// distance query) rather than the coarse precomputed raster.
const GRID_SIZE = 161;
const SEA = -1;

export function buildLocalContour(
  coastIndex: CoastIndex,
  lon: number,
  lat: number,
  thresholdKm: number,
): LocalContourResult | null {
  const kLon = kmPerDegLon(lat) || 0.0001;
  const radiusKm = Math.min(150, Math.max(15, thresholdKm * 4));
  const radiusLonDeg = radiusKm / kLon;
  const radiusLatDeg = radiusKm / KM_PER_DEG_LAT;

  const minLon = lon - radiusLonDeg;
  const maxLon = lon + radiusLonDeg;
  const minLat = Math.max(-90, lat - radiusLatDeg);
  const maxLat = Math.min(90, lat + radiusLatDeg);

  // Gather every coastline segment anywhere near the area once (with a
  // safety margin), then do all land/sea classification and distance work
  // against this small in-memory list - far cheaper than re-querying the
  // spatial index for each of the grid's ~26000 points.
  const marginLon = radiusLonDeg * 0.5;
  const marginLat = radiusLatDeg * 0.5;
  const candidates = coastIndex.candidatesInBox(
    minLon - marginLon,
    minLat - marginLat,
    maxLon + marginLon,
    maxLat + marginLat,
  );
  if (candidates.length === 0) return null;

  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const cellLon = (maxLon - minLon) / width;
  const cellLat = (maxLat - minLat) / height;

  const grid = new Float64Array(width * height).fill(SEA);

  for (let row = 0; row < height; row++) {
    const rowLat = maxLat - (row + 0.5) * cellLat;

    // Even-odd scanline fill, same technique as the offline data-generation
    // script's land mask, but scoped to this area's candidate segments only.
    // This assumes the area's edges sit in open sea, which holds for any
    // small island or coastal point - the whole point of this refinement.
    const crossings: number[] = [];
    for (const seg of candidates) {
      if (seg.alat === seg.blat) continue;
      const ylo = Math.min(seg.alat, seg.blat);
      const yhi = Math.max(seg.alat, seg.blat);
      if (rowLat < ylo || rowLat >= yhi) continue;
      const t = (rowLat - seg.alat) / (seg.blat - seg.alat);
      crossings.push(seg.alon + t * (seg.blon - seg.alon));
    }
    crossings.sort((a, b) => a - b);

    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const colStart = Math.max(0, Math.ceil((crossings[i] - minLon) / cellLon - 0.5));
      const colEnd = Math.min(width - 1, Math.floor((crossings[i + 1] - minLon) / cellLon - 0.5));
      for (let col = colStart; col <= colEnd; col++) {
        const colLon = minLon + (col + 0.5) * cellLon;
        let best = Infinity;
        for (const seg of candidates) {
          const hit = pointToSegmentKm(colLon, rowLat, seg.alon, seg.alat, seg.blon, seg.blat);
          if (hit.distanceKm < best) best = hit.distanceKm;
        }
        grid[row * width + col] = best;
      }
    }
  }

  const gen = contours().size([width, height]).thresholds([thresholdKm]);
  const [polygon] = gen(grid as unknown as number[]);
  if (!polygon || polygon.coordinates.length === 0) return null;

  const toLonLat = ([x, y]: number[]): number[] => {
    const plon = minLon + (x + 0.5) * cellLon;
    const plat = maxLat - (y + 0.5) * cellLat;
    return [plon, plat];
  };
  const coordinates = polygon.coordinates.map((poly) =>
    poly.map((ring) => ring.map(toLonLat)),
  );

  return { geojson: { type: "MultiPolygon", coordinates }, minLon, maxLon, minLat, maxLat };
}
