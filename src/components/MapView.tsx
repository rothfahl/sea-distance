import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCoastIndex } from "../lib/useCoastIndex";
import { useDistanceGrid } from "../lib/useDistanceGrid";
import { buildDistanceContour, maskGridBox } from "../lib/contour";
import { buildLocalContour } from "../lib/localContour";
import { sampleGridKm, isSeaAt } from "../lib/gridSample";
import { ClickCatcher } from "./ClickCatcher";
import { emojiIcon } from "./emojiIcon";
import { DistancePanel } from "./DistancePanel";

interface Selection {
  lat: number;
  lon: number;
  distanceKm: number;
  coastLat: number | null;
  coastLon: number | null;
}

const youIcon = emojiIcon("📍");
const coastIcon = emojiIcon("🌊", 24);

export function MapView() {
  const coastIndex = useCoastIndex();
  const distanceGrid = useDistanceGrid();
  const [selection, setSelection] = useState<Selection | null>(null);

  const ready = coastIndex !== null && distanceGrid !== null;

  function handleClick(lat: number, lon: number) {
    if (!coastIndex || !distanceGrid) return;
    if (isSeaAt(distanceGrid.grid, distanceGrid.meta, lon, lat)) {
      setSelection({ lat, lon, distanceKm: 0, coastLat: null, coastLon: null });
      return;
    }
    const hit = coastIndex.nearest(lon, lat);
    setSelection({
      lat,
      lon,
      distanceKm: hit.distanceKm,
      coastLat: hit.lat,
      coastLon: hit.lon,
    });
  }

  // Keep the connecting line short on screen even if the nearest coast point
  // lies across the antimeridian from the selected point.
  const polylineCoastLon = useMemo(() => {
    if (!selection || selection.coastLon === null) return 0;
    let lon = selection.coastLon;
    if (lon - selection.lon > 180) lon -= 360;
    else if (selection.lon - lon > 180) lon += 360;
    return lon;
  }, [selection]);

  // Use the grid's own (interpolated) value at the clicked point as the contour
  // threshold, not the independently-computed exact distance: since the contour
  // is traced from this same grid, that's what makes the isoline pass exactly
  // through the clicked point instead of through wherever the nearest, coarser
  // grid cell happens to sit.
  const contourThresholdKm = useMemo(() => {
    if (!selection || !distanceGrid || selection.distanceKm === 0) return null;
    const sampled = sampleGridKm(distanceGrid.grid, distanceGrid.meta, selection.lon, selection.lat);
    return sampled ?? selection.distanceKm;
  }, [selection, distanceGrid]);

  // Rebuild a small, exact high-resolution patch of the isoline around the
  // clicked point - the global grid's 0.1deg cells are too coarse for small
  // islands and narrow coastlines, where it can trace a blocky or even
  // disconnected line. Falls back to null (just the coarse global contour)
  // when there's no nearby coastline to refine against.
  const localContour = useMemo(() => {
    if (!selection || !coastIndex || contourThresholdKm === null || selection.distanceKm === 0) {
      return null;
    }
    return buildLocalContour(coastIndex, selection.lon, selection.lat, contourThresholdKm);
  }, [selection, coastIndex, contourThresholdKm]);

  const contour = useMemo(() => {
    if (contourThresholdKm === null || !distanceGrid) return null;
    const grid = localContour
      ? maskGridBox(
          distanceGrid.grid,
          distanceGrid.meta,
          localContour.minLon,
          localContour.maxLon,
          localContour.minLat,
          localContour.maxLat,
        )
      : distanceGrid.grid;
    return buildDistanceContour(grid, distanceGrid.meta, contourThresholdKm);
  }, [contourThresholdKm, distanceGrid, localContour]);

  return (
    <div className="map-wrap">
      <MapContainer
        center={[30, 10]}
        zoom={3}
        minZoom={2}
        worldCopyJump
        className="leaflet-container-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCatcher onClick={handleClick} />

        {contour && (
          <GeoJSON
            key={`contour-${contourThresholdKm!.toFixed(3)}`}
            data={contour as any}
            style={() => ({
              color: "#ff5252",
              weight: 2.5,
              opacity: 0.9,
              fill: false,
            })}
          />
        )}

        {localContour && (
          <GeoJSON
            key={`local-contour-${contourThresholdKm!.toFixed(3)}-${selection!.lon}-${selection!.lat}`}
            data={localContour.geojson as any}
            style={() => ({
              color: "#ff5252",
              weight: 2.5,
              opacity: 0.9,
              fill: false,
            })}
          />
        )}

        {selection && (
          <>
            <Marker position={[selection.lat, selection.lon]} icon={youIcon} />
            {selection.coastLat !== null && (
              <>
                <Marker position={[selection.coastLat, selection.coastLon!]} icon={coastIcon} />
                <Polyline
                  positions={[
                    [selection.lat, selection.lon],
                    [selection.coastLat, polylineCoastLon],
                  ]}
                  pathOptions={{ color: "#1565c0", weight: 2, dashArray: "6 6" }}
                />
              </>
            )}
          </>
        )}
      </MapContainer>

      <DistancePanel ready={ready} selection={selection} />
    </div>
  );
}
