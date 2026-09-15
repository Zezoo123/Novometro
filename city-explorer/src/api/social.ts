import { supabase } from '../lib/supabase';
import { LONDON_CITY_ID } from './stations';

export type ProfileSearchResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_following: boolean;
  follows_me: boolean;
};

export async function searchProfiles(query: string, limit = 20): Promise<ProfileSearchResult[]> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: limit });
  if (error) throw error;
  return (data ?? []).filter((r) => r.username != null) as ProfileSearchResult[];
}

export async function follow(userId: string, followeeId: string) {
  const { error } = await supabase.from('follows').insert({ follower_id: userId, followee_id: followeeId });
  if (error && error.code !== '23505') throw error;
}

export async function unfollow(userId: string, followeeId: string) {
  const { error } = await supabase.from('follows').delete().match({ follower_id: userId, followee_id: followeeId });
  if (error) throw error;
}

export type Following = { followee_id: string; username: string | null; display_name: string | null };

export async function fetchFollowing(userId: string): Promise<Following[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('followee_id,profiles!follows_followee_id_fkey(username,display_name)')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    followee_id: r.followee_id,
    username: r.profiles?.username ?? null,
    display_name: r.profiles?.display_name ?? null,
  }));
}

export type LeaderboardScope = 'city' | 'friends';
export type LeaderboardPeriod = 'all' | 'week';

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  is_me: boolean;
};

export async function fetchLeaderboard(
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
  cityId = LONDON_CITY_ID,
  limit = 50,
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('leaderboard', {
    p_city_id: cityId,
    p_scope: scope,
    p_period: period,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).filter((r) => r.username != null && r.rank != null) as LeaderboardRow[];
}

export type Challenge = {
  id: string;
  title: string;
  description: string;
  kind: 'line' | 'stations' | 'any';
  line_id: string | null;
  target: number;
  points: number;
  starts_at: string;
  ends_at: string;
  progress: number;
  completed: boolean;
};

export async function fetchMyChallenges(cityId = LONDON_CITY_ID): Promise<Challenge[]> {
  const { data, error } = await supabase.rpc('my_challenges', { p_city_id: cityId });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...(c as Omit<Challenge, 'kind' | 'completed' | 'progress'>),
    kind: c.kind as Challenge['kind'],
    progress: c.progress ?? 0,
    completed: (c.progress ?? 0) >= (c.target ?? 1),
  }));
}

export type MyStats = {
  current_streak: number;
  longest_streak: number;
  xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next: number;
  visits: number;
  stations: number;
};

export async function fetchMyStats(): Promise<MyStats> {
  const { data, error } = await supabase.rpc('my_stats');
  if (error) throw error;
  const row = data?.[0];
  return {
    current_streak: row?.current_streak ?? 0,
    longest_streak: row?.longest_streak ?? 0,
    xp: row?.xp ?? 0,
    level: row?.level ?? 1,
    xp_into_level: row?.xp_into_level ?? 0,
    xp_for_next: row?.xp_for_next ?? 100,
    visits: row?.visits ?? 0,
    stations: row?.stations ?? 0,
  };
}
