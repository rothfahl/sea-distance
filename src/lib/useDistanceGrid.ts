import { useEffect, useState } from "react";

export interface GridMeta {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  cellSizeLon: number;
  cellSizeLat: number;
  scale: number;
  seaSentinel: number;
}

export interface DistanceGrid {
  grid: Uint16Array;
  meta: GridMeta;
}

export function useDistanceGrid(): DistanceGrid | null {
  const [data, setData] = useState<DistanceGrid | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [meta, buf] = await Promise.all([
        fetch("/data/distance-grid-meta.json").then((r) => r.json() as Promise<GridMeta>),
        fetch("/data/distance-grid.bin").then((r) => r.arrayBuffer()),
      ]);
      if (cancelled) return;
      setData({ grid: new Uint16Array(buf), meta });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
