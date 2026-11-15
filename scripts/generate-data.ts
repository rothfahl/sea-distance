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

const segments: number[] = [];
for (const f of features) {
  const geom = f.geometry as MultiPolygon | Polygon;
  const polygons = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [alon, alat] = ring[i];
        const [blon, blat] = ring[i + 1];
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

const WIDTH = 720;
const HEIGHT = 360;
const CELL_LON = 360 / WIDTH;
const CELL_LAT = 180 / HEIGHT;
const SCALE = 10; // store km * SCALE as Uint16

const grid = new Uint16Array(WIDTH * HEIGHT);

console.log(`Computing ${WIDTH}x${HEIGHT} distance grid...`);
const start = Date.now();
for (let y = 0; y < HEIGHT; y++) {
  const lat = 90 - (y + 0.5) * CELL_LAT;
  for (let x = 0; x < WIDTH; x++) {
    const lon = -180 + (x + 0.5) * CELL_LON;
    const hit = index.nearest(lon, lat);
    const scaled = Math.round(hit.distanceKm * SCALE);
    grid[y * WIDTH + x] = Math.min(65535, scaled);
  }
  if (y % 30 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  row ${y}/${HEIGHT} (${elapsed}s elapsed)`);
  }
}
console.log(`Grid done in ${((Date.now() - start) / 1000).toFixed(1)}s`);

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
    },
    null,
    2,
  ),
);
console.log("Wrote distance-grid.bin");
console.log("Done.");
