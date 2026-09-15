import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

const BUCKET = 'checkins';
const MAX_EDGE = 1440;

/**
 * Public URL for a stored photo. Uploads are already capped at 1440px, so no
 * server-side resizing (a paid Supabase feature) is needed; the width hint is
 * kept so callers can switch to CDN transforms later without changing call sites.
 */
export function photoUrl(path: string, _width?: number): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Shrinks and re-encodes a local image, then uploads it under the user's
 * folder (required by the storage policy). Returns the storage path.
 */
export async function uploadCheckInPhoto(userId: string, localUri: string): Promise<string> {
  const shrunk = await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: MAX_EDGE } }], {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(shrunk.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function deleteCheckInPhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

export type FeedItem = {
  visit_id: string;
  user_id: string;
  username: string;
  station_id: string;
  station_name: string;
  line_colours: string[];
  visited_at: string;
  photo_path: string | null;
  caption: string | null;
  visit_number: number;
  reaction_count: number;
  my_reaction: string | null;
  is_me: boolean;
};

export async function fetchFeed(before?: string, limit = 20): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed', { p_before: before ?? undefined, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    line_colours: r.line_colours ?? [],
    my_reaction: r.my_reaction ?? null,
    photo_path: r.photo_path ?? null,
    caption: r.caption ?? null,
  })) as FeedItem[];
}

export type WallItem = {
  visit_id: string;
  user_id: string;
  username: string;
  visited_at: string;
  photo_path: string;
  caption: string | null;
};

export async function fetchStationWall(stationId: string, limit = 30): Promise<WallItem[]> {
  const { data, error } = await supabase.rpc('station_wall', { p_station_id: stationId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).filter((r) => !!r.photo_path) as WallItem[];
}

export async function react(userId: string, visitId: string, kind: 'like' | 'fire' | 'clap' = 'like'): Promise<void> {
  const { error } = await supabase.from('reactions').upsert({ visit_id: visitId, user_id: userId, kind });
  if (error) throw error;
}

export async function unreact(userId: string, visitId: string): Promise<void> {
  const { error } = await supabase.from('reactions').delete().match({ visit_id: visitId, user_id: userId });
  if (error) throw error;
}

export type ReportReason = 'inappropriate' | 'not_the_station' | 'spam' | 'other';

export async function reportVisit(userId: string, visitId: string, reason: ReportReason): Promise<void> {
  const { error } = await supabase.from('reports').insert({ visit_id: visitId, reporter_id: userId, reason });
  if (error && error.code !== '23505') throw error;
}

/** Owners can take their own photo down; the visit still counts. */
export async function hideMyVisit(visitId: string): Promise<void> {
  const { error } = await supabase.from('visits').update({ hidden: true }).eq('id', visitId);
  if (error) throw error;
}

/** The signed-in user's photo check-ins for the profile grid. */
export type MyPhoto = { id: string; station_id: string; visited_at: string; photo_path: string; caption: string | null; station_name: string };

export async function fetchMyPhotos(userId: string, limit = 60): Promise<MyPhoto[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id,station_id,visited_at,photo_path,caption,stations(name)')
    .eq('user_id', userId)
    .eq('hidden', false)
    .not('photo_path', 'is', null)
    .order('visited_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    station_id: r.station_id,
    visited_at: r.visited_at,
    photo_path: r.photo_path!,
    caption: r.caption,
    station_name: r.stations?.name ?? '',
  }));
}
