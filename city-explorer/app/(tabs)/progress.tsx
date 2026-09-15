import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { fetchMyLineProgress, summarise, type LineProgress } from '../../src/api/progress';
import { fetchMyStationVisits } from '../../src/api/visits';
import { useSession } from '../../src/auth/SessionProvider';

export default function ProgressScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const lines = useQuery({ queryKey: ['line-progress', userId], queryFn: fetchMyLineProgress, enabled: !!userId });
  const visits = useQuery({ queryKey: ['visits', userId], queryFn: fetchMyStationVisits, enabled: !!userId });

  const stats = summarise(lines.data ?? [], visits.data ?? []);
  const refreshing = lines.isRefetching || visits.isRefetching;
  const refresh = () => {
    lines.refetch();
    visits.refetch();
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={lines.data ?? []}
      keyExtractor={(l) => l.line_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          <View style={styles.statsRow}>
            <Stat label="Stations" value={stats.stationsUnlocked} />
            <Stat label="Lines done" value={stats.linesCompleted} />
            <Stat label="Visits" value={stats.totalVisits} />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>{lines.isLoading ? 'Loading…' : 'No lines yet.'}</Text>
      }
      renderItem={({ item }) => <LineRow line={item} />}
    />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LineRow({ line }: { line: LineProgress }) {
  const pct = line.total_stations ? line.visited_stations / line.total_stations : 0;
  const done = pct >= 1;
  const colour = line.colour ?? '#6b7280';
  return (
    <Link href={{ pathname: '/line/[id]', params: { id: line.line_id } }} asChild>
      <Pressable style={styles.row} testID={`line-${line.line_id}`}>
        <View style={[styles.swatch, { backgroundColor: colour }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.rowTop}>
            <Text style={styles.lineName} numberOfLines={1}>{line.name}</Text>
            <Text style={[styles.count, done && styles.countDone]}>
              {done ? 'Complete' : `${line.visited_stations} / ${line.total_stations}`}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: colour }]} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  content: { paddingBottom: 24 },
  header: { paddingTop: 72, paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
  title: { fontSize: 32, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  swatch: { width: 8, height: 40, borderRadius: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  lineName: { fontSize: 16, fontWeight: '600', flex: 1 },
  count: { color: '#6b7280', fontVariant: ['tabular-nums'] },
  countDone: { color: '#16a34a', fontWeight: '700' },
  track: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
