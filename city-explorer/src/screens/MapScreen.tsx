import MapboxGL from '@rnmapbox/maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchAllLineStations, fetchLines, fetchStations, type Station } from '../api/stations';
import { fetchMyStationVisits, toVisitMap } from '../api/visits';
import { useSession } from '../auth/SessionProvider';
import { CheckInBar } from '../components/CheckInBar';
import { StationSheet } from '../components/StationSheet';
import { useLocation } from '../hooks/useLocation';
import { haversine } from '../lib/geo';
import { linesByStation, linesToGeoJSON, stationsToGeoJSON } from '../lib/mapData';

const LONDON_CENTRE: [number, number] = [-0.1276, 51.5072];
// Only fly to the user if they are roughly in the city; otherwise show the network.
const IN_CITY_RADIUS_M = 60_000;

export default function MapScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { fix, status, granted } = useLocation();
  const camera = useRef<MapboxGL.Camera>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stations = useQuery({ queryKey: ['stations', 'london'], queryFn: () => fetchStations() });
  const lines = useQuery({ queryKey: ['lines', 'london'], queryFn: () => fetchLines() });
  const lineStations = useQuery({ queryKey: ['line-stations', 'london'], queryFn: () => fetchAllLineStations() });
  const visits = useQuery({ queryKey: ['visits', userId], queryFn: fetchMyStationVisits, enabled: !!userId });

  const visitMap = useMemo(() => toVisitMap(visits.data ?? []), [visits.data]);
  const stationGeo = useMemo(() => stationsToGeoJSON(stations.data ?? [], visitMap), [stations.data, visitMap]);
  const lineGeo = useMemo(() => linesToGeoJSON(lines.data ?? []), [lines.data]);
  const servedBy = useMemo(
    () => linesByStation(lineStations.data ?? [], lines.data ?? []),
    [lineStations.data, lines.data],
  );
  const stationById = useMemo(() => new Map((stations.data ?? []).map((s) => [s.id, s])), [stations.data]);

  const nearest = useMemo(() => {
    if (!fix || !stations.data?.length) return null;
    let best: { station: Station; distanceM: number } | null = null;
    for (const s of stations.data) {
      const d = haversine([fix.lon, fix.lat], [s.lon, s.lat]);
      if (!best || d < best.distanceM) best = { station: s, distanceM: d };
    }
    return best;
  }, [fix, stations.data]);

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
            id="station-dots"
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
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <CheckInBar
          nearest={nearest}
          fix={fix}
          locationDenied={status !== null && !granted}
          visitCount={nearest ? visitMap.get(nearest.station.id)?.visits ?? 0 : 0}
          onCheckedIn={() => {
            queryClient.invalidateQueries({ queryKey: ['visits', userId] });
            queryClient.invalidateQueries({ queryKey: ['line-progress', userId] });
            queryClient.invalidateQueries({ queryKey: ['line-detail'] });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  errorBanner: { position: 'absolute', top: 60, left: 16, right: 16, backgroundColor: '#dc2626', borderRadius: 12, padding: 10 },
  errorText: { color: 'white' },
});
