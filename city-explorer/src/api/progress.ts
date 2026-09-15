import { supabase } from '../lib/supabase';

type LineProgressRow = {
  line_id: string | null;
  name: string | null;
  mode: string | null;
  network: string | null;
  colour: string | null;
  total_stations: number | null;
  visited_stations: number | null;
};

export type LineProgress = {
  line_id: string;
  name: string;
  mode: string;
  network: string;
  colour: string | null;
  total_stations: number;
  visited_stations: number;
};

/** Progress of the signed-in user on every line, most complete first. */
export async function fetchMyLineProgress(): Promise<LineProgress[]> {
  const data: LineProgressRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('my_line_progress')
      .select('line_id,name,mode,network,colour,total_stations,visited_stations')
      .order('line_id')
      .range(from, from + 999);
    if (error) throw error;
    data.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  return data
    .filter(
      (r): r is LineProgress =>
        r.line_id != null && r.name != null && r.mode != null && r.network != null && r.total_stations != null && r.visited_stations != null,
    )
    .sort((a, b) => {
      // Rail first; within a network most complete first; untouched bus routes sink to the bottom.
      if (a.network !== b.network) return a.network === 'rail' ? -1 : 1;
      const pa = a.visited_stations / a.total_stations;
      const pb = b.visited_stations / b.total_stations;
      return pb - pa || a.name.localeCompare(b.name, undefined, { numeric: true });
    });
}

export type LineStationRow = {
  station_id: string;
  name: string;
  branch: number;
  sequence: number;
  visits: number;
};

/** Ordered stations on a line with the signed-in user's visit counts. */
export async function fetchLineDetail(lineId: string): Promise<LineStationRow[]> {
  const [{ data: rows, error }, { data: counts, error: countErr }] = await Promise.all([
    supabase
      .from('line_stations')
      .select('station_id,branch,sequence,stations(name)')
      .eq('line_id', lineId)
      .order('branch')
      .order('sequence'),
    supabase.from('station_visit_counts').select('station_id,visits'),
  ]);
  if (error) throw error;
  if (countErr) throw countErr;
  const visits = new Map((counts ?? []).map((c) => [c.station_id, c.visits ?? 0]));
  return (rows ?? []).map((r) => ({
    station_id: r.station_id,
    name: r.stations?.name ?? '',
    branch: r.branch,
    sequence: r.sequence,
    visits: visits.get(r.station_id) ?? 0,
  }));
}

export type Stats = { stationsUnlocked: number; linesCompleted: number; totalVisits: number };

export function summarise(lines: LineProgress[], stationCounts: { visits: number }[]): Stats {
  return {
    stationsUnlocked: stationCounts.length,
    linesCompleted: lines.filter((l) => l.total_stations > 0 && l.visited_stations >= l.total_stations).length,
    totalVisits: stationCounts.reduce((n, c) => n + c.visits, 0),
  };
}
