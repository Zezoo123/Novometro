import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Dimensions, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { fetchFeed, hideMyVisit, photoUrl, react, reportVisit, unreact, type FeedItem, type ReportReason } from '../../src/api/photos';
import { useSession } from '../../src/auth/SessionProvider';
import { useRefetchOnFocus } from '../../src/hooks/useRefetchOnFocus';

const PAGE = 20;

export default function FeedScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  useRefetchOnFocus([['feed']]);

  const feed = useInfiniteQuery({
    queryKey: ['feed', userId],
    queryFn: ({ pageParam }) => fetchFeed(pageParam, PAGE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].visited_at),
    enabled: !!userId,
  });

  const items = feed.data?.pages.flat() ?? [];

  const toggleReaction = useMutation({
    mutationFn: async (item: FeedItem) => {
      if (!userId) return;
      if (item.my_reaction) await unreact(userId, item.visit_id);
      else await react(userId, item.visit_id);
    },
    onMutate: async (item) => {
      Haptics.selectionAsync().catch(() => {});
      await queryClient.cancelQueries({ queryKey: ['feed', userId] });
      queryClient.setQueryData<typeof feed.data>(['feed', userId], (old) =>
        old && {
          ...old,
          pages: old.pages.map((page) =>
            page.map((i) =>
              i.visit_id === item.visit_id
                ? { ...i, my_reaction: i.my_reaction ? null : 'like', reaction_count: i.reaction_count + (i.my_reaction ? -1 : 1) }
                : i,
            ),
          ),
        },
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['feed', userId] }),
  });

  const report = useMutation({
    mutationFn: ({ item, reason }: { item: FeedItem; reason: ReportReason }) => reportVisit(userId!, item.visit_id, reason),
    onSuccess: () => Alert.alert('Thanks', 'We will take a look.'),
  });
  const hide = useMutation({
    mutationFn: (item: FeedItem) => hideMyVisit(item.visit_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed', userId] }),
  });

  const onMore = useCallback(
    (item: FeedItem) => {
      if (item.is_me) {
        Alert.alert('Your check-in', undefined, [
          { text: 'Remove photo', style: 'destructive', onPress: () => hide.mutate(item) },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      const reasons: [string, ReportReason][] = [
        ['Inappropriate', 'inappropriate'],
        ['Not taken at this station', 'not_the_station'],
        ['Spam', 'spam'],
      ];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { title: 'Report this check-in', options: [...reasons.map(([l]) => l), 'Cancel'], cancelButtonIndex: reasons.length, destructiveButtonIndex: 0 },
          (i) => i < reasons.length && report.mutate({ item, reason: reasons[i][1] }),
        );
      } else {
        Alert.alert('Report this check-in', undefined, [
          ...reasons.map(([l, r]) => ({ text: l, onPress: () => report.mutate({ item, reason: r }) })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      }
    },
    [hide, report],
  );

  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={(i) => i.visit_id}
      renderItem={({ item }) => <FeedCard item={item} onReact={() => toggleReaction.mutate(item)} onMore={() => onMore(item)} />}
      refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => feed.refetch()} />}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={<Text style={styles.title}>Feed</Text>}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{feed.isLoading ? 'Loading…' : 'Nothing here yet'}</Text>
          {!feed.isLoading && (
            <>
              <Text style={styles.emptyBody}>Check in at a station with a photo, and follow friends to see theirs.</Text>
              <Link href="/friends" asChild>
                <Pressable style={styles.emptyButton} testID="feed-find-friends">
                  <Text style={styles.emptyButtonText}>Find friends</Text>
                </Pressable>
              </Link>
            </>
          )}
        </View>
      }
      contentContainerStyle={styles.content}
    />
  );
}

function FeedCard({ item, onReact, onMore }: { item: FeedItem; onReact: () => void; onMore: () => void }) {
  const width = Dimensions.get('window').width;
  return (
    <View style={styles.card} testID={`feed-${item.visit_id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.username.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {item.is_me ? 'You' : `@${item.username}`}
            <Text style={styles.action}>
              {' '}
              {item.visit_number === 1 ? 'unlocked' : `visited (#${item.visit_number})`}
            </Text>
          </Text>
          <View style={styles.stationRow}>
            {item.line_colours.slice(0, 4).map((c, i) => (
              <View key={i} style={[styles.lineDot, { backgroundColor: c }]} />
            ))}
            <Text style={styles.station} numberOfLines={1}>{item.station_name}</Text>
            <Text style={styles.time}> · {timeAgo(item.visited_at)}</Text>
          </View>
        </View>
        <Pressable onPress={onMore} hitSlop={10} testID="feed-more">
          <Text style={styles.more}>···</Text>
        </Pressable>
      </View>

      {item.photo_path ? (
        <Image source={{ uri: photoUrl(item.photo_path, 1080) }} style={[styles.photo, { height: width }]} contentFit="cover" transition={200} />
      ) : (
        <View style={styles.noPhoto}>
          <Text style={styles.noPhotoText}>📍 Checked in without a photo</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Pressable onPress={onReact} style={styles.reaction} hitSlop={8} testID="feed-react">
          <Text style={[styles.reactionIcon, item.my_reaction && styles.reactionOn]}>{item.my_reaction ? '❤️' : '🤍'}</Text>
          <Text style={styles.reactionCount}>{item.reaction_count}</Text>
        </Pressable>
        {item.caption && (
          <Text style={styles.caption} numberOfLines={3}>
            <Text style={styles.captionName}>{item.is_me ? 'You' : item.username} </Text>
            {item.caption}
          </Text>
        )}
      </View>
    </View>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  content: { paddingBottom: 32 },
  title: { fontSize: 32, fontWeight: '800', paddingTop: 72, paddingHorizontal: 20, paddingBottom: 8 },
  card: { marginBottom: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', color: '#374151' },
  name: { fontWeight: '700', fontSize: 15 },
  action: { fontWeight: '400', color: '#6b7280' },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  lineDot: { width: 8, height: 8, borderRadius: 4 },
  station: { fontWeight: '600', fontSize: 13, flexShrink: 1 },
  time: { color: '#9ca3af', fontSize: 13 },
  more: { fontSize: 20, color: '#6b7280', fontWeight: '700' },
  photo: { width: '100%', backgroundColor: '#e5e7eb' },
  noPhoto: { marginHorizontal: 16, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16 },
  noPhotoText: { color: '#6b7280' },
  cardFooter: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  reactionIcon: { fontSize: 22 },
  reactionOn: {},
  reactionCount: { fontWeight: '700', color: '#374151' },
  caption: { fontSize: 15, lineHeight: 20 },
  captionName: { fontWeight: '700' },
  empty: { alignItems: 'center', padding: 32, gap: 10, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { color: '#6b7280', textAlign: 'center' },
  emptyButton: { backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  emptyButtonText: { color: 'white', fontWeight: '700' },
});
