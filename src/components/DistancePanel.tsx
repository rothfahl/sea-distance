interface Selection {
  lat: number;
  lon: number;
  distanceKm: number;
}

function formatKm(km: number): string {
  if (km >= 100) return km.toFixed(0);
  if (km >= 10) return km.toFixed(1);
  return km.toFixed(2);
}

export function DistancePanel({
  ready,
  selection,
}: {
  ready: boolean;
  selection: Selection | null;
}) {
  return (
    <div className="panel">
      <h1>🌊 How far from the sea?</h1>
      {!ready && <p>Loading coastline data…</p>}
      {ready && !selection && (
        <p>Click a point on the map to see how far it is from the sea as the crow flies.</p>
      )}
      {ready && selection && (
        <>
          <p className="distance">
            <strong>{formatKm(selection.distanceKm)} km</strong> to the sea
          </p>
          {selection.distanceKm === 0 ? (
            <p className="hint">This point is in the sea.</p>
          ) : (
          <p className="hint">
            The red line shows all places in the world that are exactly as far from the sea as
            your point.
          </p>
          )}
          <p className="coords">
            {selection.lat.toFixed(3)}°, {selection.lon.toFixed(3)}°
          </p>
        </>
      )}
    </div>
  );
}
