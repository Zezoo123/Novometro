import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  fetchLeaderboard,
  fetchMyChallenges,
  type Challenge,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type LeaderboardScope,
} from '../../src/api/social';
import { useSession } from '../../src/auth/SessionProvider';

export default function CompeteScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [scope, setScope] = useState<LeaderboardScope>('friends');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');

  const board = useQuery({
    queryKey: ['leaderboard', scope, period, userId],
    queryFn: () => fetchLeaderboard(scope, period),
    enabled: !!userId,
  });
  const challenges = useQuery({
    queryKey: ['challenges', userId],
    queryFn: () => fetchMyChallenges(),
    enabled: !!userId,
  });

  const rows = board.data ?? [];
  const meOutsideTop = rows.length > 1 && rows[rows.length - 1].is_me && rows[rows.length - 1].rank > rows[rows.length - 2].rank + 1;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(r) => r.user_id}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching || challenges.isRefetching}
          onRefresh={() => {
            board.refetch();
            challenges.refetch();
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Compete</Text>
            <Link href="/friends" asChild>
              <Pressable style={styles.findFriends} testID="find-friends">
                <Text style={styles.findFriendsText}>Find friends</Text>
              </Pressable>
            </Link>
          </View>

          {(challenges.data ?? []).map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}

          <View style={styles.segmentRow}>
            <Segment
              options={[
                ['friends', 'Friends'],
                ['city', 'London'],
              ]}
              value={scope}
              onChange={setScope}
            />
            <Segment
              options={[
                ['week', 'This week'],
                ['all', 'All time'],
              ]}
              value={period}
              onChange={setPeriod}
            />
          </View>
          <Text style={styles.boardHint}>
            {period === 'week' ? 'Check-ins since Monday' : 'Stations unlocked'}
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <>
          {meOutsideTop && index === rows.length - 1 && <Text style={styles.ellipsis}>···</Text>}
          <LeaderboardRowView row={item} />
        </>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {board.isLoading
            ? 'Loading…'
            : scope === 'friends'
              ? 'Follow some friends to race them here.'
              : 'Nobody yet. Be the first.'}
        </Text>
      }
    />
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map(([v, label]) => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          style={[styles.segmentItem, v === value && styles.segmentActive]}
          testID={`segment-${v}`}
        >
          <Text style={[styles.segmentText, v === value && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LeaderboardRowView({ row }: { row: LeaderboardRow }) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;
  return (
    <View style={[styles.row, row.is_me && styles.rowMe]}>
      <Text style={styles.rank}>{medal ?? `#${row.rank}`}</Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{row.username.slice(0, 1).toUpperCase()}</Text>
      </View>
      <Text style={[styles.name, row.is_me && styles.nameMe]} numberOfLines={1}>
        {row.is_me ? 'You' : `@${row.username}`}
      </Text>
      <Text style={styles.score}>{row.score}</Text>
    </View>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const pct = Math.min(1, challenge.progress / challenge.target);
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - Date.now()) / 86_400_000));
  return (
    <View style={styles.challenge} testID={`challenge-${challenge.id}`}>
      <View style={styles.challengeTop}>
        <Text style={styles.challengeKicker}>WEEKLY CHALLENGE · +{challenge.points} XP</Text>
        <Text style={styles.challengeDays}>{challenge.completed ? 'Done ✓' : `${daysLeft}d left`}</Text>
      </View>
      <Text style={styles.challengeTitle}>{challenge.title}</Text>
      <Text style={styles.challengeDesc}>{challenge.description}</Text>
      <View style={styles.challengeTrack}>
        <View style={[styles.challengeFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={styles.challengeProgress}>
        {challenge.progress} / {challenge.target}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  content: { paddingBottom: 32 },
  header: { paddingTop: 72, paddingHorizontal: 20, gap: 14 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800' },
  findFriends: { backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  findFriendsText: { color: 'white', fontWeight: '700', fontSize: 13 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segmentText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#111827' },
  boardHint: { color: '#6b7280', fontSize: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  rowMe: { backgroundColor: '#f0fdf4' },
  rank: { width: 36, fontSize: 16, fontWeight: '700', color: '#6b7280', fontVariant: ['tabular-nums'] },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', color: '#374151' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  nameMe: { color: '#16a34a' },
  score: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ellipsis: { textAlign: 'center', color: '#9ca3af', paddingVertical: 4 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 32, paddingHorizontal: 32 },
  challenge: { backgroundColor: '#111827', borderRadius: 16, padding: 16, gap: 6 },
  challengeTop: { flexDirection: 'row', justifyContent: 'space-between' },
  challengeKicker: { color: '#fbbf24', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  challengeDays: { color: '#9ca3af', fontSize: 12 },
  challengeTitle: { color: 'white', fontSize: 20, fontWeight: '800' },
  challengeDesc: { color: '#d1d5db', fontSize: 14 },
  challengeTrack: { height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  challengeFill: { height: 8, backgroundColor: '#fbbf24', borderRadius: 4 },
  challengeProgress: { color: '#d1d5db', fontSize: 12, textAlign: 'right' },
});
