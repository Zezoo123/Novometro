import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { fetchMyLineProgress, summarise, type LineProgress } from '../../src/api/progress';
import { fetchMyStats } from '../../src/api/social';
import { fetchMyStationVisits } from '../../src/api/visits';
import { useSession } from '../../src/auth/SessionProvider';
import { useRefetchOnFocus } from '../../src/hooks/useRefetchOnFocus';

export default function ProgressScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const lines = useQuery({ queryKey: ['line-progress', userId], queryFn: fetchMyLineProgress, enabled: !!userId });
  const visits = useQuery({ queryKey: ['visits', userId], queryFn: fetchMyStationVisits, enabled: !!userId });
  const me = useQuery({ queryKey: ['my-stats', userId], queryFn: fetchMyStats, enabled: !!userId });
  useRefetchOnFocus([['line-progress', userId], ['visits', userId], ['my-stats', userId]]);

  const stats = summarise(lines.data ?? [], visits.data ?? []);
  const refreshing = lines.isRefetching || visits.isRefetching;
  const refresh = () => {
    lines.refetch();
    visits.refetch();
    me.refetch();
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={(lines.data ?? []).filter((l) => l.network !== 'bus' || l.visited_stations > 0)}
      keyExtractor={(l) => l.line_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Progress</Text>
          {me.data && (
            <View style={styles.levelCard} testID="level-card">
              <View style={styles.levelRow}>
                <View>
                  <Text style={styles.levelLabel}>LEVEL</Text>
                  <Text style={styles.levelValue}>{me.data.level}</Text>
                </View>
                <View style={styles.streak}>
                  <Text style={styles.streakFlame}>{me.data.current_streak > 0 ? '🔥' : '🌑'}</Text>
                  <View>
                    <Text style={styles.streakValue}>{me.data.current_streak}-day streak</Text>
                    <Text style={styles.streakSub}>
                      {me.data.current_streak > 0 ? 'Check in today to keep it' : 'Check in today to start one'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${Math.round((me.data.xp_into_level / me.data.xp_for_next) * 100)}%` }]} />
              </View>
              <Text style={styles.xpText}>
                {me.data.xp_into_level} / {me.data.xp_for_next} XP to level {me.data.level + 1}
              </Text>
            </View>
          )}
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
      ListFooterComponent={
        (lines.data ?? []).some((l) => l.network === 'bus') ? (
          <Text style={styles.footer}>
            Bus routes appear here once you check in at a stop on them.
          </Text>
        ) : null
      }
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
  levelCard: { backgroundColor: '#111827', borderRadius: 16, padding: 16, gap: 10 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  levelValue: { color: 'white', fontSize: 36, fontWeight: '900', lineHeight: 40 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakFlame: { fontSize: 28 },
  streakValue: { color: 'white', fontWeight: '700' },
  streakSub: { color: '#9ca3af', fontSize: 12 },
  xpTrack: { height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: 8, backgroundColor: '#22c55e', borderRadius: 4 },
  xpText: { color: '#d1d5db', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
  footer: { color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  swatch: { width: 8, height: 40, borderRadius: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  lineName: { fontSize: 16, fontWeight: '600', flex: 1 },
  count: { color: '#6b7280', fontVariant: ['tabular-nums'] },
  countDone: { color: '#16a34a', fontWeight: '700' },
  track: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
