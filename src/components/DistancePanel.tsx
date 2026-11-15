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
      <h1>🌊 Gleich weit weg vom Meer</h1>
      {!ready && <p>Lade Küstendaten…</p>}
      {ready && !selection && (
        <p>Klicke auf einen Punkt der Karte. Du erfährst, wie weit er Luftlinie vom Meer entfernt ist.</p>
      )}
      {ready && selection && (
        <>
          <p className="distance">
            <strong>{formatKm(selection.distanceKm)} km</strong> bis zum Meer
          </p>
          <p className="hint">
            Die rote Linie zeigt alle Orte der Welt, die genauso weit vom Meer entfernt sind wie
            dein Punkt.
          </p>
          <p className="coords">
            {selection.lat.toFixed(3)}°, {selection.lon.toFixed(3)}°
          </p>
        </>
      )}
    </div>
  );
}
