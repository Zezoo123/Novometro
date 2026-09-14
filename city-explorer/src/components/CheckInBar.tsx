import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchAchievementCatalogue } from '../api/achievements';
import { CHECK_IN_COPY, CheckInError, checkIn, unlockRadiusM, type CheckInResult } from '../api/checkin';
import type { Station } from '../api/stations';
import { getFreshFix, type Fix } from '../hooks/useLocation';

type Props = {
  nearest: { station: Station; distanceM: number } | null;
  fix: Fix | null;
  locationDenied: boolean;
  visitCount: number;
  onCheckedIn: (result: CheckInResult) => void;
};

type Notice = { kind: 'ok' | 'error'; text: string; detail?: string; shareKey?: string };

export function CheckInBar({ nearest, fix, locationDenied, visitCount, onCheckedIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const catalogue = useQuery({ queryKey: ['achievement-catalogue'], queryFn: fetchAchievementCatalogue });
  const router = useRouter();

  const inRange = !!nearest && !!fix && nearest.distanceM <= unlockRadiusM(fix.accuracyM);

  const submit = async () => {
    if (!nearest) return;
    setBusy(true);
    setNotice(null);
    try {
      const fresh = await getFreshFix();
      const result = await checkIn({
        stationId: nearest.station.id,
        lat: fresh.lat,
        lon: fresh.lon,
        accuracyM: fresh.accuracyM,
        mocked: fresh.mocked,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const names = result.new_achievements
        .map((key) => catalogue.data?.find((a) => a.key === key)?.name ?? key);
      setNotice({
        kind: 'ok',
        text: result.first_visit
          ? `${nearest.station.name} unlocked!`
          : `Visit #${result.station_visit_count} to ${nearest.station.name}`,
        detail: names.length ? `🏆 ${names.join(' · ')} · tap to share` : undefined,
        shareKey: result.new_achievements[0],
      });
      onCheckedIn(result);
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const reason = e instanceof CheckInError ? e.reason : 'unknown';
      setNotice({ kind: 'error', text: CHECK_IN_COPY[reason] });
    } finally {
      setBusy(false);
    }
  };

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
            <Text style={styles.sub}>
              {visitCount > 0 ? `Visited ${visitCount}×` : 'Not yet unlocked'}
              {!inRange && ` · get within ${Math.round(unlockRadiusM(fix.accuracyM))} m`}
            </Text>
          )}
        </View>
        <Pressable
          onPress={submit}
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

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
  },
  label: { color: 'white', fontWeight: '700', fontSize: 16 },
  sub: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, minWidth: 96, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#374151' },
  buttonText: { color: 'white', fontWeight: '700' },
  notice: { borderRadius: 12, padding: 12 },
  noticeOk: { backgroundColor: '#16a34a' },
  noticeError: { backgroundColor: '#dc2626' },
  noticeText: { color: 'white', fontWeight: '600', textAlign: 'center' },
  noticeDetail: { color: 'white', textAlign: 'center', marginTop: 4 },
});
