import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  achievementIcon,
  fetchAchievementCatalogue,
  fetchMyAchievements,
  type Achievement,
  type EarnedAchievement,
} from '../../src/api/achievements';
import { fetchMyProfile, signOut } from '../../src/api/profile';
import { useSession } from '../../src/auth/SessionProvider';

type Row = { achievement: Achievement; earned: EarnedAchievement | null };

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [busy, setBusy] = useState(false);

  const profile = useQuery({ queryKey: ['profile', userId], queryFn: () => fetchMyProfile(userId!), enabled: !!userId });
  const catalogue = useQuery({ queryKey: ['achievement-catalogue'], queryFn: fetchAchievementCatalogue });
  const earned = useQuery({ queryKey: ['achievements', userId], queryFn: fetchMyAchievements, enabled: !!userId });

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, EarnedAchievement>();
    for (const e of earned.data ?? []) if (!byKey.has(e.achievement_key)) byKey.set(e.achievement_key, e);
    const all = (catalogue.data ?? []).map((a) => ({ achievement: a, earned: byKey.get(a.key) ?? null }));
    // Earned first (newest at top), then locked in catalogue order.
    return all.sort((x, y) => {
      if (!!x.earned !== !!y.earned) return x.earned ? -1 : 1;
      if (x.earned && y.earned) return y.earned.earned_at.localeCompare(x.earned.earned_at);
      return 0;
    });
  }, [catalogue.data, earned.data]);

  const earnedCount = rows.filter((r) => r.earned).length;

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(r) => r.achievement.key}
      refreshControl={<RefreshControl refreshing={earned.isRefetching} onRefresh={() => earned.refetch()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.username}>@{profile.data?.username ?? '…'}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
          <Text style={styles.sectionTitle}>
            Achievements <Text style={styles.sectionCount}>{earnedCount} / {rows.length}</Text>
          </Text>
        </View>
      }
      renderItem={({ item }) => <AchievementRow row={item} />}
      ListFooterComponent={
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSignOut}
          disabled={busy}
          testID="sign-out"
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      }
    />
  );
}

function AchievementRow({ row }: { row: Row }) {
  const { achievement, earned } = row;
  const inner = (
    <View style={[styles.row, !earned && styles.rowLocked]}>
      <Text style={styles.icon}>{achievementIcon(achievement.kind)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{achievement.name}</Text>
        <Text style={styles.desc}>{achievement.description}</Text>
      </View>
      {earned && (
        <View style={styles.rowRight}>
          <Text style={styles.date}>{formatDate(earned.earned_at)}</Text>
          <Text style={styles.shareHint}>Share ›</Text>
        </View>
      )}
    </View>
  );
  if (!earned) return inner;
  return (
    <Link href={{ pathname: '/share/[key]', params: { key: achievement.key } }} asChild>
      <Pressable testID={`achievement-${achievement.key}`}>{inner}</Pressable>
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  content: { paddingBottom: 40 },
  header: { paddingTop: 72, paddingHorizontal: 20, paddingBottom: 8 },
  username: { fontSize: 28, fontWeight: '800' },
  email: { color: '#6b7280', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sectionCount: { color: '#6b7280', fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  rowLocked: { opacity: 0.45 },
  icon: { fontSize: 26, width: 36, textAlign: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  desc: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  date: { color: '#6b7280', fontSize: 12 },
  shareHint: { color: '#16a34a', fontSize: 12, fontWeight: '600' },
  button: { marginHorizontal: 20, marginTop: 24, backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '600' },
});
