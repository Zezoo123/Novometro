import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { unlockRadiusM } from '../api/checkin';
import type { Station } from '../api/stations';
import type { CheckInNotice } from '../hooks/useCheckIn';
import type { Fix } from '../hooks/useLocation';

type Props = {
  nearest: { station: Station; distanceM: number } | null;
  /** Closest station the user has not unlocked yet; drives the "next" nudge. */
  nextUnvisited: { station: Station; distanceM: number } | null;
  fix: Fix | null;
  locationDenied: boolean;
  visitCount: number;
  busy: boolean;
  notice: CheckInNotice | null;
  onSubmit: (station: Station) => void;
};

export function CheckInBar({ nearest, nextUnvisited, fix, locationDenied, visitCount, busy, notice, onSubmit }: Props) {
  const router = useRouter();
  const inRange = !!nearest && !!fix && nearest.distanceM <= unlockRadiusM(fix.accuracyM);

  let label: string;
  if (locationDenied) label = 'Location permission is needed to check in';
  else if (!fix) label = 'Finding you…';
  else if (!nearest) label = 'No stations nearby';
  else label = `${nearest.station.name} · ${formatDistance(nearest.distanceM)}`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {notice && (
        <Pressable
          style={[styles.notice, notice.kind === 'ok' ? styles.noticeOk : styles.noticeError]}
          disabled={!notice.shareKey}
          onPress={() => notice.shareKey && router.push({ pathname: '/share/[key]', params: { key: notice.shareKey } })}
          testID="check-in-notice"
        >
          <Text style={styles.noticeText}>{notice.text}</Text>
          {notice.detail && <Text style={styles.noticeDetail}>{notice.detail}</Text>}
        </Pressable>
      )}
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          {nearest && fix && (
            <Text style={styles.sub} numberOfLines={1}>
              {visitCount > 0 ? `Visited ${visitCount}×` : 'Not yet unlocked'}
              {!inRange && ` · get within ${Math.round(unlockRadiusM(fix.accuracyM))} m`}
            </Text>
          )}
          {nearest && fix && visitCount > 0 && nextUnvisited && nextUnvisited.station.id !== nearest.station.id && (
            <Text style={styles.next} numberOfLines={1}>
              Next: {nextUnvisited.station.name} · {formatDistance(nextUnvisited.distanceM)}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => nearest && onSubmit(nearest.station)}
          disabled={!inRange || busy}
          style={[styles.button, (!inRange || busy) && styles.buttonDisabled]}
          testID="check-in"
        >
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Check in</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111827', borderRadius: 16, padding: 14 },
  label: { color: 'white', fontWeight: '700', fontSize: 16 },
  sub: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  next: { color: '#fbbf24', fontSize: 13, marginTop: 2, fontWeight: '600' },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, minWidth: 96, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#374151' },
  buttonText: { color: 'white', fontWeight: '700' },
  notice: { borderRadius: 12, padding: 12 },
  noticeOk: { backgroundColor: '#16a34a' },
  noticeError: { backgroundColor: '#dc2626' },
  noticeText: { color: 'white', fontWeight: '600', textAlign: 'center' },
  noticeDetail: { color: 'white', textAlign: 'center', marginTop: 4 },
});
