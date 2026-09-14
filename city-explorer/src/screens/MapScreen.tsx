import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { fetchStations, type Station } from '../api/stations';
import { haversine } from '../lib/geo';

const LONDON_CENTRE: [number, number] = [-0.1276, 51.5072];

export default function MapScreen() {
  const [locStatus, setLocStatus] = useState<Location.PermissionStatus | null>(null);
  // Local-only until the verified check-in flow lands (#9). Nothing here is persisted.
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});

  const { data: stations = [], isLoading, error } = useQuery({
    queryKey: ['stations', 'london'],
    queryFn: () => fetchStations(),
  });

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => setLocStatus(status));
  }, []);

  const center = useMemo(() => LONDON_CENTRE, []);

  const mockUnlockNearest = async () => {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here: [number, number] = [pos.coords.longitude, pos.coords.latitude];
    let nearest: Station | null = null;
    let best = Infinity;
    for (const s of stations) {
      const d = haversine(here, [s.lon, s.lat]);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    if (nearest) setUnlocked((u) => ({ ...u, [nearest.id]: true }));
  };

  const locGranted = locStatus === 'granted';

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView style={{ flex: 1 }}>
        <MapboxGL.Camera zoomLevel={12} centerCoordinate={center} />
        {locGranted && <MapboxGL.UserLocation visible />}

        {/* PointAnnotation per station is a native view each; replaced by a CircleLayer in #8. */}
        {stations.map((s) => (
          <MapboxGL.PointAnnotation key={s.id} id={s.id} coordinate={[s.lon, s.lat]}>
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: 'white',
                backgroundColor: unlocked[s.id] ? '#22c55e' : '#3b82f6',
              }}
            />
          </MapboxGL.PointAnnotation>
        ))}
      </MapboxGL.MapView>

      <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }}>
        <Pressable
          onPress={mockUnlockNearest}
          disabled={!locGranted || stations.length === 0}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: locGranted ? '#111827' : '#9ca3af',
            borderRadius: 12,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Mock unlock nearest (local only)</Text>
        </Pressable>
        {locStatus && locStatus !== 'granted' && (
          <Text style={{ marginTop: 8 }}>Location permission is needed to check in.</Text>
        )}
        {isLoading && <Text style={{ marginTop: 8 }}>Loading stations…</Text>}
        {error && <Text style={{ marginTop: 8, color: 'red' }}>{String(error)}</Text>}
      </View>
    </View>
  );
}
