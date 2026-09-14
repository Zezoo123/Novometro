import MapboxGL from '@rnmapbox/maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchStations, type Station } from '../api/stations';
import { fetchMyStationVisits, toVisitMap } from '../api/visits';
import { useSession } from '../auth/SessionProvider';
import { CheckInBar } from '../components/CheckInBar';
import { useLocation } from '../hooks/useLocation';
import { haversine } from '../lib/geo';

const LONDON_CENTRE: [number, number] = [-0.1276, 51.5072];

export default function MapScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { fix, status, granted } = useLocation();
  const camera = useRef<MapboxGL.Camera>(null);

  const stations = useQuery({ queryKey: ['stations', 'london'], queryFn: () => fetchStations() });
  const visits = useQuery({
    queryKey: ['visits', userId],
    queryFn: fetchMyStationVisits,
    enabled: !!userId,
  });
  const visitMap = useMemo(() => toVisitMap(visits.data ?? []), [visits.data]);

  const nearest = useMemo(() => {
    if (!fix || !stations.data?.length) return null;
    let best: { station: Station; distanceM: number } | null = null;
    for (const s of stations.data) {
      const d = haversine([fix.lon, fix.lat], [s.lon, s.lat]);
      if (!best || d < best.distanceM) best = { station: s, distanceM: d };
    }
    return best;
  }, [fix, stations.data]);

  // Fly to the user once we have a first fix.
  const flown = useRef(false);
  useEffect(() => {
    if (fix && !flown.current) {
      flown.current = true;
      camera.current?.setCamera({ centerCoordinate: [fix.lon, fix.lat], zoomLevel: 14, animationDuration: 800 });
    }
  }, [fix]);

  const error = stations.error ?? visits.error;

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView style={{ flex: 1 }} scaleBarEnabled={false}>
        <MapboxGL.Camera ref={camera} defaultSettings={{ centerCoordinate: LONDON_CENTRE, zoomLevel: 12 }} />
        {granted && <MapboxGL.UserLocation visible />}

        {/* PointAnnotation per station is a native view each and does not repaint its child on
            state change, hence the key. Replaced by a CircleLayer in #8. */}
        {(stations.data ?? []).map((s) => {
          const unlocked = visitMap.has(s.id);
          return (
            <MapboxGL.PointAnnotation key={`${s.id}:${unlocked ? 1 : 0}`} id={s.id} coordinate={[s.lon, s.lat]}>
              <View style={[styles.marker, unlocked ? styles.markerUnlocked : styles.markerLocked]} />
            </MapboxGL.PointAnnotation>
          );
        })}
      </MapboxGL.MapView>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{String(error)}</Text>
        </View>
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'white' },
  markerLocked: { backgroundColor: '#3b82f6' },
  markerUnlocked: { backgroundColor: '#22c55e' },
  errorBanner: { position: 'absolute', top: 60, left: 16, right: 16, backgroundColor: '#dc2626', borderRadius: 12, padding: 10 },
  errorText: { color: 'white' },
});
