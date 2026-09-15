import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { fetchLineDetail, fetchMyLineProgress } from '../../src/api/progress';
import { fetchStations } from '../../src/api/stations';
import { useLocation } from '../../src/hooks/useLocation';
import { haversine } from '../../src/lib/geo';
import { formatDistance } from '../../src/components/CheckInBar';
import { useSession } from '../../src/auth/SessionProvider';

export default function LineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;

  const lines = useQuery({ queryKey: ['line-progress', userId], queryFn: fetchMyLineProgress, enabled: !!userId });
  const line = lines.data?.find((l) => l.line_id === id);

  const detail = useQuery({
    queryKey: ['line-detail', id, userId],
    queryFn: () => fetchLineDetail(id!, userId!),
    enabled: !!id && !!userId,
  });
  const allStations = useQuery({ queryKey: ['stations', 'london', 'rail'], queryFn: () => fetchStations('rail'), staleTime: 3_600_000 });
  const { fix } = useLocation();

  // Show each station once, in the order of its first appearance across branches.
  const seen = new Set<string>();
  const stations = (detail.data ?? []).filter((s) => (seen.has(s.station_id) ? false : (seen.add(s.station_id), true)));
  const colour = line?.colour ?? '#6b7280';

  // The closest station on this line you have not unlocked: the next thing to do.
  const coords = new Map((allStations.data ?? []).map((s) => [s.id, [s.lon, s.lat] as [number, number]]));
  let nextUp: { name: string; distanceM: number } | null = null;
  if (fix) {
    for (const s of stations) {
      const c = coords.get(s.station_id);
      if (s.visits > 0 || !c) continue;
      const d = haversine([fix.lon, fix.lat], c);
      if (!nextUp || d < nextUp.distanceM) nextUp = { name: s.name, distanceM: d };
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: line?.name ?? 'Line', headerBackTitle: 'Progress' }} />
      <FlatList
        style={styles.screen}
        data={stations}
        keyExtractor={(s) => s.station_id}
        ListHeaderComponent={
          line ? (
            <View style={styles.header}>
              <Text style={styles.summary}>
                {line.visited_stations} of {line.total_stations} stations
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round((line.visited_stations / line.total_stations) * 100)}%`, backgroundColor: colour },
                  ]}
                />
              </View>
              {nextUp && (
                <Text style={styles.nextUp}>
                  Closest unvisited: <Text style={styles.nextUpName}>{nextUp.name}</Text> · {formatDistance(nextUp.distanceM)}
                </Text>
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const visited = item.visits > 0;
          const last = index === stations.length - 1;
          return (
            <View style={styles.row}>
              <View style={styles.rail}>
                {index > 0 && <View style={[styles.railLine, { backgroundColor: colour }]} />}
                <View style={[styles.dot, { borderColor: colour }, visited && { backgroundColor: colour }]} />
                {!last && <View style={[styles.railLine, { backgroundColor: colour }]} />}
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.name, !visited && styles.nameLocked]}>{item.name}</Text>
                {visited && <Text style={styles.visits}>{item.visits}×</Text>}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{detail.isLoading ? 'Loading…' : 'No stations.'}</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  header: { padding: 20, gap: 8 },
  summary: { fontSize: 16, fontWeight: '600' },
  nextUp: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  nextUpName: { color: '#111827', fontWeight: '700' },
  track: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', paddingHorizontal: 20, minHeight: 44 },
  rail: { width: 24, alignItems: 'center' },
  railLine: { flex: 1, width: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, backgroundColor: 'white' },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 },
  name: { fontSize: 16 },
  nameLocked: { color: '#9ca3af' },
  visits: { color: '#6b7280', fontVariant: ['tabular-nums'] },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
});
