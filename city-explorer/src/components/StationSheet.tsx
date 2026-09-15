import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchStationWall, photoUrl } from '../api/photos';
import type { CheckInNotice } from '../hooks/useCheckIn';
import type { Line, Station } from '../api/stations';
import type { StationVisitCount } from '../api/visits';

type Props = {
  station: Station;
  lines: Line[];
  visit: StationVisitCount | undefined;
  distanceM: number | null;
  canCheckIn: boolean;
  busy: boolean;
  notice: CheckInNotice | null;
  onCheckIn: () => void;
  onClose: () => void;
};

export function StationSheet({ station, lines, visit, distanceM, canCheckIn, busy, notice, onCheckIn, onClose }: Props) {
  const wall = useQuery({ queryKey: ['station-wall', station.id], queryFn: () => fetchStationWall(station.id, 12), staleTime: 60_000 });
  return (
    <View style={styles.sheet} testID="station-sheet">
      <View style={styles.handle} />
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>{station.name}</Text>
        <Pressable onPress={onClose} hitSlop={12} testID="station-sheet-close">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.lines}>
        {lines.map((l) => (
          <View key={l.id} style={[styles.pill, { backgroundColor: l.colour ?? '#6b7280' }]}>
            <Text style={styles.pillText}>{l.name.replace(/ line$/, '')}</Text>
          </View>
        ))}
      </View>

      <View style={styles.facts}>
        <Fact label="Status" value={visit ? 'Unlocked' : 'Locked'} accent={!!visit} />
        <Fact label="Your visits" value={String(visit?.visits ?? 0)} />
        <Fact label="Distance" value={distanceM == null ? '—' : formatDistance(distanceM)} />
      </View>
      {wall.data && wall.data.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wall}>
          {wall.data.map((w) => (
            <View key={w.visit_id} style={styles.wallItem}>
              <Image source={{ uri: photoUrl(w.photo_path, 240) }} style={styles.wallPhoto} contentFit="cover" transition={150} />
              <Text style={styles.wallName} numberOfLines={1}>@{w.username}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.wallEmpty}>No photos here yet. Be the first.</Text>
      )}
      {visit && (
        <Text style={styles.meta}>
          First visit {formatDate(visit.first_visited_at)} · last {formatDate(visit.last_visited_at)}
        </Text>
      )}
      {notice && (
        <View style={[styles.notice, notice.kind === 'ok' ? styles.noticeOk : styles.noticeError]}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      )}
      <Pressable
        onPress={onCheckIn}
        disabled={!canCheckIn || busy}
        style={[styles.checkIn, (!canCheckIn || busy) && styles.checkInDisabled]}
        testID="sheet-check-in"
      >
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.checkInText}>{canCheckIn ? 'Check in here' : 'Get closer to check in'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factValue, accent && styles.factAccent]}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  close: { fontSize: 18, color: '#6b7280', paddingTop: 4 },
  lines: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: 'white', fontWeight: '700', fontSize: 12 },
  facts: { flexDirection: 'row', gap: 12 },
  fact: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  factValue: { fontSize: 18, fontWeight: '800' },
  factAccent: { color: '#16a34a' },
  factLabel: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  meta: { color: '#6b7280', fontSize: 13 },
  wall: { gap: 8 },
  wallItem: { width: 88 },
  wallPhoto: { width: 88, height: 88, borderRadius: 10, backgroundColor: '#e5e7eb' },
  wallName: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  wallEmpty: { color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
  notice: { borderRadius: 12, padding: 10 },
  noticeOk: { backgroundColor: '#dcfce7' },
  noticeError: { backgroundColor: '#fee2e2' },
  noticeText: { color: '#111827', fontWeight: '600', textAlign: 'center' },
  checkIn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  checkInDisabled: { backgroundColor: '#e5e7eb' },
  checkInText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
