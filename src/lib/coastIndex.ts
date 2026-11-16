import RBush from "rbush";
import { pointToSegmentKm, kmPerDegLon, KM_PER_DEG_LAT, normLon, type SegmentHit } from "./geo";

export interface SegmentItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  alon: number;
  alat: number;
  blon: number;
  blat: number;
}

export class CoastIndex {
  private tree: RBush<SegmentItem>;
  private segmentCount: number;

  constructor(flat: Float32Array) {
    this.segmentCount = flat.length / 4;
    const items: SegmentItem[] = new Array(this.segmentCount);
    for (let i = 0; i < this.segmentCount; i++) {
      const o = i * 4;
      const alon = flat[o];
      const alat = flat[o + 1];
      const blon = flat[o + 2];
      const blat = flat[o + 3];
      items[i] = {
        minX: Math.min(alon, blon),
        minY: Math.min(alat, blat),
        maxX: Math.max(alon, blon),
        maxY: Math.max(alat, blat),
        alon,
        alat,
        blon,
        blat,
      };
    }
    this.tree = new RBush<SegmentItem>();
    this.tree.load(items);
  }

  /**
   * Finds the nearest coastline segment to (lon, lat) by iteratively expanding
   * a search box until it is provably larger than the best distance found,
   * which guarantees correctness. Handles antimeridian wraparound.
   */
  nearest(lon: number, lat: number): SegmentHit {
    const kLon = kmPerDegLon(lat) || 0.0001;
    let radiusDeg = 1;
    let best: SegmentHit | null = null;

    for (let iter = 0; iter < 12; iter++) {
      const radiusKmLon = radiusDeg * kLon;
      const radiusKmLat = radiusDeg * KM_PER_DEG_LAT;
      const candidates = this.searchWrapped(lon, lat, radiusDeg);

      for (const seg of candidates) {
        const hit = pointToSegmentKm(lon, lat, seg.alon, seg.alat, seg.blon, seg.blat);
        if (!best || hit.distanceKm < best.distanceKm) best = hit;
      }

      const safeRadiusKm = Math.min(radiusKmLon, radiusKmLat);
      if (best && safeRadiusKm >= best.distanceKm) break;
      if (radiusDeg >= 180) break;
      radiusDeg = Math.min(180, radiusDeg * 2.5);
    }

    if (!best) {
      // Degenerate fallback (should not happen with real coastline data).
      return { distanceKm: Infinity, lon, lat };
    }
    return best;
  }

  /**
   * Returns every indexed segment overlapping the given lon/lat box, handling
   * antimeridian wraparound the same way `nearest` does. Used to grab a
   * small, reusable candidate set for local high-resolution work (see
   * localContour.ts) instead of re-querying the tree per grid point.
   */
  candidatesInBox(minLon: number, minLat: number, maxLon: number, maxLat: number): SegmentItem[] {
    const results: SegmentItem[] = [];
    for (const shift of [-360, 0, 360]) {
      const sMinX = minLon + shift;
      const sMaxX = maxLon + shift;
      if (sMaxX < -185 || sMinX > 185) continue;
      results.push(...this.tree.search({ minX: sMinX, minY: minLat, maxX: sMaxX, maxY: maxLat }));
    }
    return results;
  }

  private searchWrapped(lon: number, lat: number, radiusDeg: number): SegmentItem[] {
    const minY = Math.max(-90, lat - radiusDeg);
    const maxY = Math.min(90, lat + radiusDeg);
    const base = normLon(lon);
    const results: SegmentItem[] = [];
    // Query the box plus +-360 shifted copies so results near +-180 are found too.
    for (const shift of [-360, 0, 360]) {
      const minX = base + shift - radiusDeg;
      const maxX = base + shift + radiusDeg;
      if (maxX < -180 || minX > 180) continue;
      results.push(...this.tree.search({ minX, minY, maxX, maxY }));
    }
    return results;
  }
}
