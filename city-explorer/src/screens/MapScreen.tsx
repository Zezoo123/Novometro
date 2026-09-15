import MapboxGL from '@rnmapbox/maps';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { unlockRadiusM } from '../api/checkin';
import { fetchAllLineStations, fetchLines, fetchStations, type Station } from '../api/stations';
import { fetchMyStationVisits, toVisitMap } from '../api/visits';
import { useSession } from '../auth/SessionProvider';
import { CheckInBar } from '../components/CheckInBar';
import { Confetti } from '../components/Confetti';
import { ModeFilter } from '../components/ModeFilter';
import { StationSheet } from '../components/StationSheet';
import { useLocation } from '../hooks/useLocation';
import { haversine } from '../lib/geo';
import { useCheckIn } from '../hooks/useCheckIn';
import { linesByStation, linesToGeoJSON, stationsToGeoJSON } from '../lib/mapData';
import { stationMatches, useMapModes } from '../lib/mapFilters';

const LONDON_CENTRE: [number, number] = [-0.1276, 51.5072];
// Only fly to the user if they are roughly in the city; otherwise show the network.
const IN_CITY_RADIUS_M = 60_000;

export default function MapScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { fix, status, granted } = useLocation();
  const check = useCheckIn(userId);
  const camera = useRef<MapboxGL.Camera>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { modes, toggle } = useMapModes();

  const stations = useQuery({ queryKey: ['stations', 'london'], queryFn: () => fetchStations() });
  const lines = useQuery({ queryKey: ['lines', 'london'], queryFn: () => fetchLines() });
  const lineStations = useQuery({ queryKey: ['line-stations', 'london'], queryFn: () => fetchAllLineStations() });
  const visits = useQuery({ queryKey: ['visits', userId], queryFn: fetchMyStationVisits, enabled: !!userId });

  const visitMap = useMemo(() => toVisitMap(visits.data ?? []), [visits.data]);

  // Which modes actually have data (bus shows as "soon" until imported).
  const availableModes = useMemo(() => new Set((lines.data ?? []).map((l) => l.mode)), [lines.data]);
  const shownStations = useMemo(
    () => (stations.data ?? []).filter((s) => stationMatches(s.modes, modes)),
    [stations.data, modes],
  );
  const shownLines = useMemo(() => (lines.data ?? []).filter((l) => (modes as string[]).includes(l.mode)), [lines.data, modes]);

  const stationGeo = useMemo(() => stationsToGeoJSON(shownStations, visitMap), [shownStations, visitMap]);
  const lineGeo = useMemo(() => linesToGeoJSON(shownLines), [shownLines]);
  const servedBy = useMemo(
    () => linesByStation(lineStations.data ?? [], lines.data ?? []),
    [lineStations.data, lines.data],
  );
  const stationById = useMemo(() => new Map((stations.data ?? []).map((s) => [s.id, s])), [stations.data]);

  // Nearest station overall (what you can check in at) and nearest one you
  // have not unlocked yet (where to go next).
  const { nearest, nextUnvisited } = useMemo(() => {
    if (!fix || !shownStations.length) return { nearest: null, nextUnvisited: null };
    let best: { station: Station; distanceM: number } | null = null;
    let bestNew: { station: Station; distanceM: number } | null = null;
    for (const s of shownStations) {
      const d = haversine([fix.lon, fix.lat], [s.lon, s.lat]);
      if (!best || d < best.distanceM) best = { station: s, distanceM: d };
      if (!visitMap.has(s.id) && (!bestNew || d < bestNew.distanceM)) bestNew = { station: s, distanceM: d };
    }
    return { nearest: best, nextUnvisited: bestNew };
  }, [fix, shownStations, visitMap]);

  const flown = useRef(false);
  useEffect(() => {
    if (!fix || flown.current) return;
    flown.current = true;
    const inCity = haversine([fix.lon, fix.lat], LONDON_CENTRE) < IN_CITY_RADIUS_M;
    if (inCity) camera.current?.setCamera({ centerCoordinate: [fix.lon, fix.lat], zoomLevel: 14, animationDuration: 800 });
  }, [fix]);

  const onStationPress = useCallback((e: { features: { properties?: { id?: string } | null }[] }) => {
    const id = e.features[0]?.properties?.id;
    setSelectedId(id ?? null);
  }, []);

  const selected = selectedId ? stationById.get(selectedId) : undefined;
  const selectedDistance = selected && fix ? haversine([fix.lon, fix.lat], [selected.lon, selected.lat]) : null;
  const error = stations.error ?? lines.error ?? lineStations.error ?? visits.error;

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView style={{ flex: 1 }} scaleBarEnabled={false} onPress={() => setSelectedId(null)}>
        <MapboxGL.Camera ref={camera} defaultSettings={{ centerCoordinate: LONDON_CENTRE, zoomLevel: 11 }} />
        {granted && <MapboxGL.UserLocation visible />}

        <MapboxGL.ShapeSource id="lines" shape={lineGeo}>
          <MapboxGL.LineLayer
            id="line-casing"
            style={{ lineColor: 'white', lineWidth: 5, lineJoin: 'round', lineCap: 'round', lineOpacity: 0.9 }}
          />
          <MapboxGL.LineLayer
            id="line-stroke"
            style={{ lineColor: ['get', 'colour'], lineWidth: 3, lineJoin: 'round', lineCap: 'round' }}
          />
        </MapboxGL.ShapeSource>

        <MapboxGL.ShapeSource id="stations" shape={stationGeo} onPress={onStationPress} hitbox={{ width: 24, height: 24 }}>
          <MapboxGL.CircleLayer
            id="bus-stops"
            filter={['==', ['get', 'network'], 'bus']}
            minZoomLevel={13}
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
              circleColor: ['case', ['get', 'unlocked'], '#22c55e', '#DC241F'],
              circleStrokeColor: 'white',
              circleStrokeWidth: 1.5,
            }}
          />
          <MapboxGL.CircleLayer
            id="station-dots"
            filter={['!=', ['get', 'network'], 'bus']}
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 6, 16, 9],
              circleColor: ['case', ['get', 'unlocked'], '#22c55e', 'white'],
              circleStrokeColor: ['case', ['get', 'unlocked'], 'white', '#374151'],
              circleStrokeWidth: 2,
              circleOpacity: 1,
            }}
          />
          <MapboxGL.CircleLayer
            id="station-selected"
            filter={['==', ['get', 'id'], selectedId ?? '']}
            style={{ circleRadius: 14, circleColor: 'transparent', circleStrokeColor: '#111827', circleStrokeWidth: 3 }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      <ModeFilter selected={modes} onToggle={toggle} available={availableModes} />
      {check.celebrate && <Confetti onDone={check.endCelebration} />}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{String(error)}</Text>
        </View>
      )}

      {selected ? (
        <StationSheet
          station={selected}
          lines={servedBy.get(selected.id) ?? []}
          visit={visitMap.get(selected.id)}
          distanceM={selectedDistance}
          canCheckIn={!!fix && selectedDistance != null && selectedDistance <= unlockRadiusM(fix.accuracyM)}
          busy={check.busy}
          notice={check.notice}
          onCheckIn={() => check.submit(selected)}
          onClose={() => {
            setSelectedId(null);
            check.clearNotice();
          }}
        />
      ) : (
        <CheckInBar
          nearest={nearest}
          nextUnvisited={nextUnvisited}
          fix={fix}
          locationDenied={status !== null && !granted}
          visitCount={nearest ? visitMap.get(nearest.station.id)?.visits ?? 0 : 0}
          busy={check.busy}
          notice={check.notice}
          onSubmit={check.submit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  errorBanner: { position: 'absolute', top: 104, left: 16, right: 16, backgroundColor: '#dc2626', borderRadius: 12, padding: 10 },
  errorText: { color: 'white' },
});
