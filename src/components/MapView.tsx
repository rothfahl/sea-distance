import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCoastIndex } from "../lib/useCoastIndex";
import { useDistanceGrid } from "../lib/useDistanceGrid";
import { buildDistanceContour } from "../lib/contour";
import { ClickCatcher } from "./ClickCatcher";
import { emojiIcon } from "./emojiIcon";
import { DistancePanel } from "./DistancePanel";

interface Selection {
  lat: number;
  lon: number;
  distanceKm: number;
  coastLat: number;
  coastLon: number;
}

const youIcon = emojiIcon("📍");
const coastIcon = emojiIcon("🌊", 24);

export function MapView() {
  const coastIndex = useCoastIndex();
  const distanceGrid = useDistanceGrid();
  const [selection, setSelection] = useState<Selection | null>(null);

  const ready = coastIndex !== null && distanceGrid !== null;

  function handleClick(lat: number, lon: number) {
    if (!coastIndex) return;
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
    if (!selection) return 0;
    let lon = selection.coastLon;
    if (lon - selection.lon > 180) lon -= 360;
    else if (selection.lon - lon > 180) lon += 360;
    return lon;
  }, [selection]);

  const contour = useMemo(() => {
    if (!selection || !distanceGrid) return null;
    return buildDistanceContour(distanceGrid.grid, distanceGrid.meta, selection.distanceKm);
  }, [selection, distanceGrid]);

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
            key={`contour-${selection!.distanceKm.toFixed(2)}`}
            data={contour as any}
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
            <Marker position={[selection.coastLat, selection.coastLon]} icon={coastIcon} />
            <Polyline
              positions={[
                [selection.lat, selection.lon],
                [selection.coastLat, polylineCoastLon],
              ]}
              pathOptions={{ color: "#1565c0", weight: 2, dashArray: "6 6" }}
            />
          </>
        )}
      </MapContainer>

      <DistancePanel ready={ready} selection={selection} />
    </div>
  );
}
