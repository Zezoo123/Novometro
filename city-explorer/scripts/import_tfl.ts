// Imports London lines, stations and ordered station sequences from the TfL API.
//
// Usage (needs scripts/.env, see scripts/.env.example):
//   npm run import:tfl
//
// Idempotent: lines and stations upsert on their TfL ids; line_stations are
// replaced per line.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = need('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = need('SUPABASE_SERVICE_KEY');
const TFL_APP_KEY = process.env.TFL_APP_KEY; // optional, raises the rate limit
const LONDON_ID = '00000000-0000-0000-0000-000000000001';
const SOURCE = 'tfl';
const MODES = ['tube', 'dlr', 'overground', 'elizabeth-line'];

// TfL does not return brand colours; these are the official ones.
const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#000000', piccadilly: '#003688', victoria: '#0098D4', 'waterloo-city': '#95CDBA',
  dlr: '#00A4A7', elizabeth: '#6950A1',
  liberty: '#5D6061', lioness: '#FAA61A', mildmay: '#0077AD', suffragette: '#5BBB6C',
  weaver: '#823A62', windrush: '#ED1B00',
};

type TflLine = { id: string; name: string; modeName: string };
type TflStopPoint = {
  id: string; stationId?: string; topMostParentId?: string; name: string;
  lat: number; lon: number; modes?: string[];
};
type TflSequence = {
  lineStrings: string[];
  stopPointSequences: { branchId: number; stopPoint: TflStopPoint[] }[];
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function tfl<T>(path: string): Promise<T> {
  const url = new URL(`https://api.tfl.gov.uk${path}`);
  if (TFL_APP_KEY) url.searchParams.set('app_key', TFL_APP_KEY);
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      const delay = 1000 * 2 ** attempt;
      console.warn(`  ${res.status} on ${path}, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  throw new Error(`Gave up on ${path}`);
}

function cleanName(name: string): string {
  return name
    .replace(/\s+\(London\)/, '')
    .replace(/\s+(Underground|DLR|Rail|Overground|Elizabeth line)?\s*Station$/i, '')
    .trim();
}

async function run() {
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  console.log('Fetching lines…');
  const tflLines = await tfl<TflLine[]>(`/Line/Mode/${MODES.join(',')}`);
  console.log(`  ${tflLines.length} lines`);

  const stationRows = new Map<string, {
    city_id: string; external_source: string; external_id: string; name: string;
    lat: number; lon: number; modes: string[]; network: 'rail'; hub_id: string | null;
  }>();
  const sequences: { lineId: string; stops: { external_id: string; branch: number; sequence: number }[]; geometry: unknown }[] = [];

  for (const line of tflLines) {
    process.stdout.write(`  ${line.name} (${line.modeName}) … `);
    const seq = await tfl<TflSequence>(`/Line/${line.id}/Route/Sequence/inbound`);
    const stops: { external_id: string; branch: number; sequence: number }[] = [];
    const seenInLine = new Set<string>();

    for (const branch of seq.stopPointSequences) {
      branch.stopPoint.forEach((sp, i) => {
        const externalId = sp.stationId ?? sp.id;
        const key = `${externalId}:${branch.branchId}`;
        if (seenInLine.has(key)) return;
        seenInLine.add(key);
        stops.push({ external_id: externalId, branch: branch.branchId, sequence: i });

        const existing = stationRows.get(externalId);
        const modes = new Set([...(existing?.modes ?? []), ...(sp.modes ?? []), line.modeName]);
        stationRows.set(externalId, {
          city_id: LONDON_ID,
          external_source: SOURCE,
          external_id: externalId,
          name: existing?.name ?? cleanName(sp.name),
          lat: sp.lat,
          lon: sp.lon,
          modes: [...modes].filter((m) => MODES.includes(m)).sort(),
          network: 'rail',
          hub_id: sp.topMostParentId?.startsWith('HUB') ? sp.topMostParentId : existing?.hub_id ?? null,
        });
      });
    }

    const geometry = seq.lineStrings.map((s) => JSON.parse(s)[0] as [number, number][]);
    sequences.push({ lineId: line.id, stops, geometry });
    console.log(`${stops.length} stops, ${seq.stopPointSequences.length} branches`);
  }

  console.log(`Upserting ${stationRows.size} stations…`);
  const stationList = [...stationRows.values()];
  for (let i = 0; i < stationList.length; i += 200) {
    const { error } = await db.from('stations')
      .upsert(stationList.slice(i, i + 200), { onConflict: 'external_source,external_id' });
    if (error) throw error;
  }

  console.log(`Upserting ${tflLines.length} lines…`);
  const { data: lines, error: lineErr } = await db.from('lines')
    .upsert(tflLines.map((l) => ({
      city_id: LONDON_ID,
      external_source: SOURCE,
      external_id: l.id,
      name: l.name.endsWith(' line') || l.modeName !== 'tube' ? l.name : `${l.name} line`,
      mode: l.modeName,
      colour: LINE_COLOURS[l.id] ?? null,
      geometry: sequences.find((s) => s.lineId === l.id)?.geometry ?? null,
    })), { onConflict: 'external_source,external_id' })
    .select('id, external_id');
  if (lineErr) throw lineErr;

  const stations = await fetchAllStations(db, SOURCE);
  const stationIdByExt = new Map(stations.map((s) => [s.external_id, s.id]));

  console.log('Writing line_stations…');
  for (const seq of sequences) {
    const lineId = lines!.find((l) => l.external_id === seq.lineId)!.id;
    const rows = seq.stops.map((s) => ({
      line_id: lineId,
      station_id: stationIdByExt.get(s.external_id)!,
      branch: s.branch,
      sequence: s.sequence,
    }));
    const { error: delErr } = await db.from('line_stations').delete().eq('line_id', lineId);
    if (delErr) throw delErr;
    const { error: insErr } = await db.from('line_stations').insert(rows);
    if (insErr) throw insErr;
  }

  console.log('Done.');
}


/** PostgREST caps responses at 1000 rows; page through everything. */
async function fetchAllStations(db: SupabaseClient, source: string) {
  const out: { id: string; external_id: string; network: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('stations')
      .select('id, external_id, network')
      .eq('external_source', source)
      .order('external_id')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as typeof out));
    if (!data || data.length < 1000) break;
  }
  return out;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
