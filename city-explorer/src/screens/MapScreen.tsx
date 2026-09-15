import MapboxGL from '@rnmapbox/maps';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { unlockRadiusM } from '../api/checkin';
import { fetchLines, fetchStationLines, fetchStations, type Station } from '../api/stations';
import { fetchMyStationVisits, toVisitMap } from '../api/visits';
import { useSession } from '../auth/SessionProvider';
import { CheckInBar } from '../components/CheckInBar';
import { Confetti } from '../components/Confetti';
import { ModeFilter } from '../components/ModeFilter';
import { StationSheet } from '../components/StationSheet';
import { useLocation } from '../hooks/useLocation';
import { haversine } from '../lib/geo';
import { useCheckIn } from '../hooks/useCheckIn';
import { linesToGeoJSON, stationsToGeoJSON } from '../lib/mapData';
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

  const busOn = (modes as string[]).includes('bus');
  const railStations = useQuery({ queryKey: ['stations', 'london', 'rail'], queryFn: () => fetchStations('rail'), staleTime: 3_600_000 });
  const busStations = useQuery({
    queryKey: ['stations', 'london', 'bus'],
    queryFn: () => fetchStations('bus'),
    enabled: busOn,
    staleTime: 3_600_000,
  });
  const lines = useQuery({ queryKey: ['lines', 'london', 'rail'], queryFn: () => fetchLines('rail'), staleTime: 3_600_000 });
  // Bus routes are small rows (no geometry) and tell us whether the Bus chip is available at all.
  const busLines = useQuery({ queryKey: ['lines', 'london', 'bus'], queryFn: () => fetchLines('bus'), staleTime: 3_600_000 });
  const visits = useQuery({ queryKey: ['visits', userId], queryFn: fetchMyStationVisits, enabled: !!userId });

  const visitMap = useMemo(() => toVisitMap(visits.data ?? []), [visits.data]);

  // Which modes actually have data (bus shows as "soon" until imported).
  const availableModes = useMemo(
    () => new Set([...(lines.data ?? []).map((l) => l.mode), ...(busLines.data?.length ? ['bus'] : [])]),
    [lines.data, busLines.data],
  );
  const allStations = useMemo(
    () => [...(railStations.data ?? []), ...(busOn ? busStations.data ?? [] : [])],
    [railStations.data, busStations.data, busOn],
  );
  const shownStations = useMemo(() => allStations.filter((s) => stationMatches(s.modes, modes)), [allStations, modes]);
  const shownLines = useMemo(() => (lines.data ?? []).filter((l) => (modes as string[]).includes(l.mode)), [lines.data, modes]);

  const stationGeo = useMemo(() => stationsToGeoJSON(shownStations, visitMap), [shownStations, visitMap]);
  const lineGeo = useMemo(() => linesToGeoJSON(shownLines), [shownLines]);
  const stationById = useMemo(() => new Map(allStations.map((s) => [s.id, s])), [allStations]);
  const selectedLines = useQuery({
    queryKey: ['station-lines', selectedId],
    queryFn: () => fetchStationLines(selectedId!),
    enabled: !!selectedId,
    staleTime: 3_600_000,
  });

  // Nearest station overall (what you can check in at) and nearest one you
  // have not unlocked yet (where to go next).
  const { nearest, nextUnvisited } = useMemo(() => {
    if (!fix || !shownStations.length) return { nearest: null, nextUnvisited: null };
    let best: { station: Station; distanceM: number } | null = null;
    let bestRail: { station: Station; distanceM: number } | null = null;
    let bestNew: { station: Station; distanceM: number } | null = null;
    for (const s of shownStations) {
      const d = haversine([fix.lon, fix.lat], [s.lon, s.lat]);
      if (!best || d < best.distanceM) best = { station: s, distanceM: d };
      if (s.network === 'rail' && (!bestRail || d < bestRail.distanceM)) bestRail = { station: s, distanceM: d };
      if (!visitMap.has(s.id) && (!bestNew || d < bestNew.distanceM)) bestNew = { station: s, distanceM: d };
    }
    // A rail station in range always wins over a nearer bus stop: it is the main game.
    const preferred = bestRail && bestRail.distanceM <= unlockRadiusM(fix.accuracyM) ? bestRail : best;
    return { nearest: preferred, nextUnvisited: bestNew };
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
  const error = railStations.error ?? busStations.error ?? lines.error ?? visits.error;

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
          lines={selectedLines.data ?? []}
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
