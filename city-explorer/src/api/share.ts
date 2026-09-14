import { supabase } from '../lib/supabase';

/** Records that the user opened the share sheet for an achievement. Best effort. */
export async function recordShare(userId: string, achievementKey: string | null, channel?: string) {
  const { error } = await supabase
    .from('share_events')
    .insert({ user_id: userId, achievement_key: achievementKey, channel: channel ?? null });
  if (error) console.warn('share_events insert failed', error.message);
}
