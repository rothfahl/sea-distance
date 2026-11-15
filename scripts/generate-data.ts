// Offline data-generation script. Run with: npm run gen-data
//
// Produces two static assets consumed by the client app:
//  - public/data/coastline-segments.bin + .json  (exact coastline geometry, for precise
//    per-click distance queries via a client-side R-tree)
//  - public/data/distance-grid.bin + .json        (precomputed world raster of
//    distance-to-coast, used to draw the "equidistant" isoline via d3-contour)
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { feature } from "topojson-client";
import { CoastIndex } from "../src/lib/coastIndex";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

console.log("Loading world-atlas land-50m topology...");
const topoPath = join(root, "node_modules", "world-atlas", "land-50m.json");
const topology = JSON.parse(readFileSync(topoPath, "utf-8"));
const land = feature(topology, topology.objects.land) as any;

type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };
type Polygon = { type: "Polygon"; coordinates: number[][][] };

const features = "features" in land ? land.features : [land as any];

// `segments` (exported, used for the live point-to-coast distance index) excludes
// Antarctica's artificial polar closing edge. `maskSegments` keeps it, because the
// land/sea rasterization below needs it (see the comment where it's used).
const segments: number[] = [];
const maskSegments: number[] = [];
for (const f of features) {
  const geom = f.geometry as MultiPolygon | Polygon;
  const polygons = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [alon, alat] = ring[i];
        let [blon, blat] = ring[i + 1];
        // Some rings (Fiji, Chukotka, Antarctica's polar closing edge, ...) cross
        // the antimeridian without being split there. Left as-is, the raw lon
        // difference would be ~360 degrees instead of the true short distance,
        // turning the segment into a bogus "coastline" spanning nearly every
        // longitude. Unwrap it onto the short way around the globe instead.
        if (blon - alon > 180) blon -= 360;
        else if (alon - blon > 180) blon += 360;
        maskSegments.push(alon, alat, blon, blat);
        // Antarctica's ring is artificially closed with a straight edge along a
        // latitude circle near the pole (not a real coastline) - exclude it here,
        // or any point this close to a pole would measure "distance to coast"
        // against that fake edge instead of the real, much farther-away coastline.
        if (Math.abs(alat) > 89 && Math.abs(blat) > 89) continue;
        segments.push(alon, alat, blon, blat);
      }
    }
  }
}

const segmentCount = segments.length / 4;
console.log(`Extracted ${segmentCount} coastline segments.`);

const flat = new Float32Array(segments);
writeFileSync(join(outDir, "coastline-segments.bin"), Buffer.from(flat.buffer));
writeFileSync(
  join(outDir, "coastline-meta.json"),
  JSON.stringify({ segmentCount }, null, 2),
);
console.log("Wrote coastline-segments.bin");

console.log("Building spatial index for grid precomputation...");
const index = new CoastIndex(flat);

const WIDTH = 3600;
const HEIGHT = 1800;
const CELL_LON = 360 / WIDTH;
const CELL_LAT = 180 / HEIGHT;
const SCALE = 10; // store km * SCALE as Uint16
const SEA_SENTINEL = 65535; // marks ocean cells (max real distance is ~2800km = 28000 units)

// Rasterize the land polygons onto the grid via an even-odd scanline fill
// (works for holes too, since even-odd parity across *all* ring edges is
// independent of ring nesting). Uses `maskSegments`, which - unlike the
// exported coastline index - still includes Antarctica's polar closing edge:
// that edge runs along a line of latitude, so a horizontal (row) scanline
// can never cross it (no vertical extent) - but a vertical (column) scanline
// can, since it does have longitude extent. Antarctica's real coastline data
// stops short of the pole in places, with just this closing edge "sealing"
// the cap; relying on the row scan alone leaves an incorrect sea band in
// that gap, which the column scan (OR'd in below) fills in correctly.
console.log("Rasterizing land mask...");
const maskFlat = new Float32Array(maskSegments);
const maskSegmentCount = maskFlat.length / 4;

const crossingsPerRow: number[][] = Array.from({ length: HEIGHT }, () => []);
const crossingsPerCol: number[][] = Array.from({ length: WIDTH }, () => []);
for (let s = 0; s < maskSegmentCount; s++) {
  const o = s * 4;
  const x1 = maskFlat[o];
  const y1 = maskFlat[o + 1];
  const x2 = maskFlat[o + 2];
  const y2 = maskFlat[o + 3];
  if (y1 !== y2) {
    const ylo = Math.min(y1, y2);
    const yhi = Math.max(y1, y2);
    for (let row = 0; row < HEIGHT; row++) {
      const latRow = 90 - (row + 0.5) * CELL_LAT;
      if (latRow < ylo || latRow >= yhi) continue;
      const t = (latRow - y1) / (y2 - y1);
      let x = x1 + t * (x2 - x1);
      // The antimeridian unwrap above can leave x slightly outside
      // [-180,180). Left as-is, that out-of-range value sorts to the wrong
      // end of this row's crossing list instead of next to the real
      // crossings near the seam, corrupting even-odd pairing for the whole
      // row (manifests as huge spurious land/sea bands right at the
      // dateline). Normalize back into [-180,180) so sort order matches
      // true circular longitude order.
      x = ((x + 180) % 360 + 360) % 360 - 180;
      crossingsPerRow[row].push(x);
    }
  }
  if (x1 !== x2) {
    const xlo = Math.min(x1, x2);
    const xhi = Math.max(x1, x2);
    for (let col = 0; col < WIDTH; col++) {
      const lonCol = -180 + (col + 0.5) * CELL_LON;
      // Same wraparound issue as above: the segment's x-range may sit
      // slightly outside [-180,180). Test the column's longitude against
      // the segment's raw range directly, and also its +-360 aliases, so a
      // column right next to the seam still finds the segment that was
      // shifted out of range to represent it (otherwise this column gets
      // an odd crossing count and mispairs with a crossing far away).
      let lc = lonCol;
      if (lc < xlo) lc += 360;
      else if (lc >= xhi) lc -= 360;
      if (lc < xlo || lc >= xhi) continue;
      const t = (lc - x1) / (x2 - x1);
      crossingsPerCol[col].push(y1 + t * (y2 - y1));
    }
  }
}

const landMask = new Uint8Array(WIDTH * HEIGHT);
for (let row = 0; row < HEIGHT; row++) {
  const xs = crossingsPerRow[row].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const colStart = Math.max(0, Math.ceil((xs[i] - -180) / CELL_LON - 0.5));
    const colEnd = Math.min(WIDTH - 1, Math.floor((xs[i + 1] - -180) / CELL_LON - 0.5));
    for (let col = colStart; col <= colEnd; col++) {
      landMask[row * WIDTH + col] = 1;
    }
  }
}
for (let col = 0; col < WIDTH; col++) {
  const ys = crossingsPerCol[col].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ys.length; i += 2) {
    // Latitude decreases as row increases, so the smaller-latitude crossing
    // (ys[i]) is the larger row index (further from the north pole).
    const rowStart = Math.max(0, Math.ceil((90 - ys[i + 1]) / CELL_LAT - 0.5));
    const rowEnd = Math.min(HEIGHT - 1, Math.floor((90 - ys[i]) / CELL_LAT - 0.5));
    for (let row = rowStart; row <= rowEnd; row++) {
      landMask[row * WIDTH + col] = 1;
    }
  }
}

const grid = new Uint16Array(WIDTH * HEIGHT);

console.log(`Computing ${WIDTH}x${HEIGHT} distance grid (land cells only)...`);
const start = Date.now();
let landCells = 0;
for (let y = 0; y < HEIGHT; y++) {
  const lat = 90 - (y + 0.5) * CELL_LAT;
  for (let x = 0; x < WIDTH; x++) {
    const idx = y * WIDTH + x;
    if (!landMask[idx]) {
      grid[idx] = SEA_SENTINEL;
      continue;
    }
    landCells++;
    const lon = -180 + (x + 0.5) * CELL_LON;
    const hit = index.nearest(lon, lat);
    const scaled = Math.round(hit.distanceKm * SCALE);
    grid[idx] = Math.min(SEA_SENTINEL - 1, scaled);
  }
  if (y % 30 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  row ${y}/${HEIGHT} (${elapsed}s elapsed)`);
  }
}
console.log(
  `Grid done in ${((Date.now() - start) / 1000).toFixed(1)}s (${landCells} land cells of ${WIDTH * HEIGHT})`,
);

writeFileSync(join(outDir, "distance-grid.bin"), Buffer.from(grid.buffer));
writeFileSync(
  join(outDir, "distance-grid-meta.json"),
  JSON.stringify(
    {
      width: WIDTH,
      height: HEIGHT,
      minLon: -180,
      maxLon: 180,
      minLat: -90,
      maxLat: 90,
      cellSizeLon: CELL_LON,
      cellSizeLat: CELL_LAT,
      scale: SCALE,
      seaSentinel: SEA_SENTINEL,
    },
    null,
    2,
  ),
);
console.log("Wrote distance-grid.bin");
console.log("Done.");
