import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchFollowing, follow, searchProfiles, unfollow, type ProfileSearchResult } from '../src/api/social';
import { useSession } from '../src/auth/SessionProvider';

export default function FriendsScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  const following = useQuery({ queryKey: ['following', userId], queryFn: () => fetchFollowing(userId!), enabled: !!userId });
  const results = useQuery({
    queryKey: ['profile-search', query],
    queryFn: () => searchProfiles(query),
    enabled: query.trim().length >= 2,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['following', userId] });
    queryClient.invalidateQueries({ queryKey: ['profile-search'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['visits'] });
  };
  const followMut = useMutation({ mutationFn: (id: string) => follow(userId!, id), onSuccess: invalidate });
  const unfollowMut = useMutation({ mutationFn: (id: string) => unfollow(userId!, id), onSuccess: invalidate });

  const showingSearch = query.trim().length >= 2;
  const data: ProfileSearchResult[] = showingSearch
    ? (results.data ?? [])
    : (following.data ?? []).map((f) => ({
        id: f.followee_id,
        username: f.username ?? '',
        display_name: f.display_name,
        avatar_url: null,
        is_following: true,
        follows_me: false,
      }));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Friends', headerBackTitle: 'Back' }} />
      <View style={styles.screen}>
        <TextInput
          style={styles.search}
          placeholder="Search by username"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          testID="friend-search"
        />
        <Text style={styles.sectionTitle}>{showingSearch ? 'Results' : `Following · ${following.data?.length ?? 0}`}</Text>
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.username.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>@{item.username}</Text>
                {item.follows_me && <Text style={styles.meta}>Follows you</Text>}
              </View>
              <Pressable
                onPress={() => (item.is_following ? unfollowMut.mutate(item.id) : followMut.mutate(item.id))}
                disabled={followMut.isPending || unfollowMut.isPending}
                style={[styles.button, item.is_following && styles.buttonSecondary]}
                testID={`follow-${item.username}`}
              >
                <Text style={[styles.buttonText, item.is_following && styles.buttonTextSecondary]}>
                  {item.is_following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {showingSearch
                ? results.isLoading
                  ? 'Searching…'
                  : 'No one with that username yet.'
                : 'Search for a friend by their username to follow them.'}
            </Text>
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white', padding: 20, gap: 12 },
  search: { backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', color: '#374151' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#6b7280', fontSize: 12 },
  button: { backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 90, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#f3f4f6' },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 13 },
  buttonTextSecondary: { color: '#111827' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 32 },
});
