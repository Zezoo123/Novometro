import { supabase, type Tables } from '../lib/supabase';

export const LONDON_CITY_ID = '00000000-0000-0000-0000-000000000001';

export type Station = Pick<Tables<'stations'>, 'id' | 'name' | 'lat' | 'lon' | 'modes' | 'hub_id'>;
export type Line = Pick<Tables<'lines'>, 'id' | 'name' | 'mode' | 'colour' | 'geometry'>;
export type LineStation = Pick<Tables<'line_stations'>, 'line_id' | 'station_id' | 'branch' | 'sequence'>;

export async function fetchStations(cityId = LONDON_CITY_ID): Promise<Station[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id,name,lat,lon,modes,hub_id')
    .eq('city_id', cityId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchLines(cityId = LONDON_CITY_ID): Promise<Line[]> {
  const { data, error } = await supabase
    .from('lines')
    .select('id,name,mode,colour,geometry')
    .eq('city_id', cityId)
    .order('name');
  if (error) throw error;
  return data;
}

/** Ordered stations for one line, including branches. */
export async function fetchLineStations(lineId: string): Promise<LineStation[]> {
  const { data, error } = await supabase
    .from('line_stations')
    .select('line_id,station_id,branch,sequence')
    .eq('line_id', lineId)
    .order('branch')
    .order('sequence');
  if (error) throw error;
  return data;
}

export type NearestStation = { id: string; name: string; lat: number; lon: number; distance_m: number };

export async function fetchNearestStations(lat: number, lon: number, limit = 5): Promise<NearestStation[]> {
  const { data, error } = await supabase.rpc('nearest_stations', { p_lat: lat, p_lon: lon, p_limit: limit });
  if (error) throw error;
  return data;
}

/** Every line/station pairing in a city, for "which lines serve this station". */
export async function fetchAllLineStations(cityId = LONDON_CITY_ID): Promise<LineStation[]> {
  const { data, error } = await supabase
    .from('line_stations')
    .select('line_id,station_id,branch,sequence,lines!inner(city_id)')
    .eq('lines.city_id', cityId);
  if (error) throw error;
  return data.map(({ line_id, station_id, branch, sequence }) => ({ line_id, station_id, branch, sequence }));
}
