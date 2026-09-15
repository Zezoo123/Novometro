import { supabase, type Tables } from '../lib/supabase';

export type Achievement = Tables<'achievements'> & { network: 'rail' | 'bus' | null };

export type EarnedAchievement = {
  id: string;
  achievement_key: string;
  station_id: string | null;
  earned_at: string;
};

/** The full catalogue, including per-line completions. */
const KIND_ORDER: Achievement['kind'][] = ['first_visit', 'station_regular', 'explorer', 'line_complete', 'all_lines'];

export async function fetchAchievementCatalogue(): Promise<Achievement[]> {
  const { data, error } = await supabase.from('achievements').select('*, lines(network)');
  if (error) throw error;
  return data
    .map(({ lines, ...a }) => ({ ...a, network: (lines?.network as Achievement['network']) ?? null }))
    .sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.threshold ?? Number.MAX_SAFE_INTEGER) - (b.threshold ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
}

/** Everything the signed-in user has earned, newest first. */
export async function fetchMyAchievements(): Promise<EarnedAchievement[]> {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('id,achievement_key,station_id,earned_at')
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Icon per achievement kind, until we have artwork. */
export function achievementIcon(kind: Achievement['kind']): string {
  switch (kind) {
    case 'first_visit':
      return '🚇';
    case 'station_regular':
      return '🏠';
    case 'explorer':
      return '🧭';
    case 'line_complete':
      return '🏁';
    case 'all_lines':
      return '👑';
    default:
      return '⭐';
  }
}
