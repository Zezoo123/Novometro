import { supabase, type Tables } from '../lib/supabase';

export const LONDON_CITY_ID = '00000000-0000-0000-0000-000000000001';

export type Network = 'rail' | 'bus';
export type Station = Pick<Tables<'stations'>, 'id' | 'name' | 'lat' | 'lon' | 'modes' | 'hub_id' | 'network'>;
export type Line = Pick<Tables<'lines'>, 'id' | 'name' | 'mode' | 'colour' | 'geometry' | 'network'>;
export type LineStation = Pick<Tables<'line_stations'>, 'line_id' | 'station_id' | 'branch' | 'sequence'>;

/** PostgREST returns at most 1000 rows per request; page through the rest. */
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

/** Stations in one network. Rail is ~470 rows; bus is ~12,600 and paged. */
export async function fetchStations(network: Network = 'rail', cityId = LONDON_CITY_ID): Promise<Station[]> {
  return pageAll<Station>((from, to) =>
    supabase
      .from('stations')
      .select('id,name,lat,lon,modes,hub_id,network')
      .eq('city_id', cityId)
      .eq('network', network)
      .order('id')
      .range(from, to),
  );
}

/** Lines in one network. Bus routes come without geometry (only stops are drawn). */
export async function fetchLines(network: Network = 'rail', cityId = LONDON_CITY_ID): Promise<Line[]> {
  if (network === 'rail') {
    return pageAll<Line>((from, to) =>
      supabase.from('lines').select('id,name,mode,colour,geometry,network').eq('city_id', cityId).eq('network', 'rail').order('name').range(from, to),
    );
  }
  const rows = await pageAll<Omit<Line, 'geometry'>>((from, to) =>
    supabase.from('lines').select('id,name,mode,colour,network').eq('city_id', cityId).eq('network', 'bus').order('name').range(from, to),
  );
  return rows.map((r) => ({ ...r, geometry: null }));
}

/** Ordered stations for one line, including branches. */
export async function fetchLineStations(lineId: string): Promise<LineStation[]> {
  return pageAll<LineStation>((from, to) =>
    supabase
      .from('line_stations')
      .select('line_id,station_id,branch,sequence')
      .eq('line_id', lineId)
      .order('branch')
      .order('sequence')
      .range(from, to),
  );
}

/** Lines that serve one station, for the station sheet. */
export async function fetchStationLines(stationId: string): Promise<Line[]> {
  const { data, error } = await supabase
    .from('line_stations')
    .select('lines(id,name,mode,colour,network)')
    .eq('station_id', stationId);
  if (error) throw error;
  const seen = new Map<string, Line>();
  for (const row of data ?? []) {
    const l = row.lines;
    if (l && !seen.has(l.id)) seen.set(l.id, { ...l, geometry: null });
  }
  return [...seen.values()].sort((a, b) => (a.network === b.network ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.network === 'rail' ? -1 : 1));
}

export type NearestStation = { id: string; name: string; lat: number; lon: number; distance_m: number };

export async function fetchNearestStations(lat: number, lon: number, limit = 5, network?: Network): Promise<NearestStation[]> {
  const { data, error } = await supabase.rpc('nearest_stations', { p_lat: lat, p_lon: lon, p_limit: limit, p_network: network ?? undefined });
  if (error) throw error;
  return data;
}
