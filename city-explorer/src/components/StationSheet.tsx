import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Line, Station } from '../api/stations';
import type { StationVisitCount } from '../api/visits';

type Props = {
  station: Station;
  lines: Line[];
  visit: StationVisitCount | undefined;
  distanceM: number | null;
  onClose: () => void;
};

export function StationSheet({ station, lines, visit, distanceM, onClose }: Props) {
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
      {visit && (
        <Text style={styles.meta}>
          First visit {formatDate(visit.first_visited_at)} · last {formatDate(visit.last_visited_at)}
        </Text>
      )}
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
});
