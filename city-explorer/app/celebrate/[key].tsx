import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { fetchAchievementCatalogue, fetchMyAchievements } from '../../src/api/achievements';
import { fetchMyPhotos, photoUrl } from '../../src/api/photos';
import { fetchMyProfile } from '../../src/api/profile';
import { fetchMyLineProgress } from '../../src/api/progress';
import { recordShare } from '../../src/api/share';
import { fetchLineStations } from '../../src/api/stations';
import { useSession } from '../../src/auth/SessionProvider';
import { Confetti } from '../../src/components/Confetti';
import { ShareCard } from '../../src/components/ShareCard';

const BRAND = '#111827';

/**
 * Full-screen moment for the achievements worth shouting about: a line
 * completed, the whole network, every station. Shown right after the
 * check-in that earned it, with the photos from that line and the share
 * button in the same place.
 */
export default function CelebrateScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id;
  const cardRef = useRef<View>(null);
  const [confetti, setConfetti] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogue = useQuery({ queryKey: ['achievement-catalogue', 'v2'], queryFn: fetchAchievementCatalogue });
  const earned = useQuery({ queryKey: ['achievements', userId], queryFn: fetchMyAchievements, enabled: !!userId });
  const profile = useQuery({ queryKey: ['profile', userId], queryFn: () => fetchMyProfile(userId!), enabled: !!userId });
  const lines = useQuery({ queryKey: ['line-progress', userId], queryFn: fetchMyLineProgress, enabled: !!userId });
  const photos = useQuery({ queryKey: ['my-photos', userId], queryFn: () => fetchMyPhotos(userId!, 200), enabled: !!userId });

  const achievement = catalogue.data?.find((a) => a.key === key);
  const mine = earned.data?.find((e) => e.achievement_key === key);
  const line = achievement?.line_id ? lines.data?.find((l) => l.line_id === achievement.line_id) : undefined;
  const lineStations = useQuery({
    queryKey: ['line-stations', achievement?.line_id],
    queryFn: () => fetchLineStations(achievement!.line_id!),
    enabled: !!achievement?.line_id,
  });

  // Photos from this line (or all of them for city-wide achievements), newest first, up to 9.
  const collage = useMemo(() => {
    const all = photos.data ?? [];
    const onLine = achievement?.line_id
      ? new Set((lineStations.data ?? []).map((ls) => ls.station_id))
      : null;
    return all.filter((p) => !onLine || onLine.has(p.station_id)).slice(0, 9).map((p) => photoUrl(p.photo_path));
  }, [photos.data, lineStations.data, achievement?.line_id]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const colour = line?.colour ?? BRAND;
  const detail = line
    ? `${line.total_stations} stations`
    : achievement?.kind === 'explorer'
      ? `${achievement.threshold ?? 'every'} stations`
      : undefined;

  const share = async () => {
    if (!cardRef.current || !userId || !achievement) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', fileName: `novometro-${achievement.key.replace(/[^a-z0-9]+/gi, '-')}` });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share it' });
      await recordShare(userId, achievement.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  const loading = catalogue.isLoading || earned.isLoading || profile.isLoading;

  return (
    <View style={[styles.screen, { backgroundColor: colour }]}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{line ? 'LINE COMPLETE' : 'ACHIEVEMENT'}</Text>
        <Text style={styles.headline}>{achievement?.name ?? '…'}</Text>
        <Text style={styles.sub}>
          {line
            ? `Every one of the ${line.total_stations} stations on the ${line.name}. Not many people can say that.`
            : (achievement?.description ?? '')}
        </Text>

        {loading || !achievement || !mine ? (
          <ActivityIndicator color="white" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.cardWrap}>
            <ShareCard
              ref={cardRef}
              achievement={achievement}
              username={profile.data?.username ?? 'explorer'}
              earnedAt={mine.earned_at}
              colour={colour}
              detail={detail}
              photos={collage}
            />
          </View>
        )}

        <Pressable style={[styles.share, busy && styles.disabled]} onPress={share} disabled={busy || !achievement || !mine} testID="celebrate-share">
          {busy ? <ActivityIndicator color={colour} /> : <Text style={[styles.shareText, { color: colour }]}>Share it</Text>}
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} hitSlop={12} testID="celebrate-close">
          <Text style={styles.close}>Keep exploring</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingTop: 80, paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center', gap: 12 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', letterSpacing: 3, fontSize: 12 },
  headline: { color: 'white', fontSize: 40, fontWeight: '900', textAlign: 'center', lineHeight: 44 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  cardWrap: { borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  share: { marginTop: 20, backgroundColor: 'white', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, minWidth: 220, alignItems: 'center' },
  shareText: { fontWeight: '800', fontSize: 17 },
  disabled: { opacity: 0.6 },
  close: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 16, fontSize: 15 },
  error: { color: 'white', marginTop: 8 },
});
