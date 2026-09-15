import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { fetchAchievementCatalogue, fetchMyAchievements } from '../../src/api/achievements';
import { fetchMyProfile } from '../../src/api/profile';
import { fetchMyLineProgress } from '../../src/api/progress';
import { recordShare } from '../../src/api/share';
import { useSession } from '../../src/auth/SessionProvider';
import { CARD_WIDTH, ShareCard } from '../../src/components/ShareCard';

const BRAND_COLOUR = '#111827';

export default function ShareScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogue = useQuery({ queryKey: ['achievement-catalogue', 'v2'], queryFn: fetchAchievementCatalogue });
  const earned = useQuery({ queryKey: ['achievements', userId], queryFn: fetchMyAchievements, enabled: !!userId });
  const profile = useQuery({ queryKey: ['profile', userId], queryFn: () => fetchMyProfile(userId!), enabled: !!userId });
  const lines = useQuery({ queryKey: ['line-progress', userId], queryFn: fetchMyLineProgress, enabled: !!userId });

  const achievement = catalogue.data?.find((a) => a.key === key);
  const mine = earned.data?.find((e) => e.achievement_key === key);
  const line = achievement?.line_id ? lines.data?.find((l) => l.line_id === achievement.line_id) : undefined;

  const share = async () => {
    if (!cardRef.current || !userId || !achievement) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        fileName: `novometro-${achievement.key.replace(/[^a-z0-9]+/gi, '-')}`,
      });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your achievement' });
      await recordShare(userId, key ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share.');
    } finally {
      setBusy(false);
    }
  };

  const loading = catalogue.isLoading || earned.isLoading || profile.isLoading;

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Share', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator />
        ) : !achievement || !mine ? (
          <Text style={styles.muted}>You have not earned this one yet.</Text>
        ) : (
          <>
            <ShareCard
              ref={cardRef}
              achievement={achievement}
              username={profile.data?.username ?? 'explorer'}
              earnedAt={mine.earned_at}
              colour={line?.colour ?? BRAND_COLOUR}
              detail={line ? `${line.total_stations} stations` : undefined}
            />
            <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={share} disabled={busy} testID="share">
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Share</Text>}
            </Pressable>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', padding: 24, gap: 20 },
  muted: { color: '#6b7280' },
  button: { width: CARD_WIDTH, backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  error: { color: '#dc2626' },
});
