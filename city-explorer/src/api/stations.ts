import { supabase } from '../lib/supabase';

export type Station = {
  id: string;
  name: string;
  lines: string[] | null;
  lat: number | null;
  lon: number | null;
};

export async function fetchLondonStations(): Promise<Station[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('id,name,lines,lat,lon')
    .eq('city_id', '00000000-0000-0000-0000-000000000001') // London seed
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).filter(s => s.lat && s.lon) as Station[];
}
