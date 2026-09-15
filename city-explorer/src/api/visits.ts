import { supabase } from '../lib/supabase';

export type StationVisitCount = {
  station_id: string;
  visits: number;
  first_visited_at: string;
  last_visited_at: string;
};

/**
 * The calling user's visit counts per station. Followers can also read the
 * rows of people they follow, so always filter by user id.
 */
export async function fetchMyStationVisits(userId: string): Promise<StationVisitCount[]> {
  const { data, error } = await supabase
    .from('station_visit_counts')
    .select('station_id,visits,first_visited_at,last_visited_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).filter(
    (r): r is StationVisitCount =>
      r.station_id != null && r.visits != null && r.first_visited_at != null && r.last_visited_at != null,
  );
}

export function toVisitMap(rows: StationVisitCount[]): Map<string, StationVisitCount> {
  return new Map(rows.map((r) => [r.station_id, r]));
}
