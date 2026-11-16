import { useEffect, useState } from "react";
import { CoastIndex } from "./coastIndex";

export function useCoastIndex(): CoastIndex | null {
  const [index, setIndex] = useState<CoastIndex | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buf = await fetch("/data/coastline-segments-fine.bin").then((r) => r.arrayBuffer());
      if (cancelled) return;
      setIndex(new CoastIndex(new Float32Array(buf)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return index;
}
