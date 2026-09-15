// Imports London bus routes and stops from the TfL API as the 'bus' network.
//
// Usage (needs scripts/.env, see scripts/.env.example; a TFL_APP_KEY is
// strongly recommended: ~700 routes × 2 directions of Route/Sequence calls):
//   npm run import:tfl:bus            # everything
//   npm run import:tfl:bus -- 24 88   # just these routes
//
// Idempotent: routes and stops upsert on their TfL ids; line_stations are
// replaced per route. Requires migration 20260915000300_networks.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = need('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = need('SUPABASE_SERVICE_KEY');
const TFL_APP_KEY = process.env.TFL_APP_KEY;
const LONDON_ID = '00000000-0000-0000-0000-000000000001';
const SOURCE = 'tfl';
const BUS_COLOUR = '#DC241F';
const CONCURRENCY = 4;

type TflLine = { id: string; name: string; modeName: string };
type TflStopPoint = { id: string; stationId?: string; topMostParentId?: string; name: string; lat: number; lon: number };
type TflSequence = {
  lineStrings: string[];
  stopPointSequences: { branchId: number; stopPoint: TflStopPoint[] }[];
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function tfl<T>(path: string): Promise<T | null> {
  const url = new URL(`https://api.tfl.gov.uk${path}`);
  if (TFL_APP_KEY) url.searchParams.set('app_key', TFL_APP_KEY);
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const delay = 1500 * 2 ** attempt;
      console.warn(`  ${res.status} on ${path}, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  throw new Error(`Gave up on ${path}`);
}

function cleanName(name: string): string {
  return name.replace(/\s+\(Stop [A-Z0-9]+\)$/i, '').trim();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function run() {
  const only = new Set(process.argv.slice(2).map((s) => s.toLowerCase()));
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  console.log('Fetching bus routes…');
  let routes = (await tfl<TflLine[]>('/Line/Mode/bus')) ?? [];
  if (only.size) routes = routes.filter((r) => only.has(r.id.toLowerCase()));
  console.log(`  ${routes.length} routes`);

  const stops = new Map<string, { external_id: string; name: string; lat: number; lon: number; hub_id: string | null }>();
  const sequences: { lineId: string; stops: { external_id: string; branch: number; sequence: number }[]; geometry: unknown }[] = [];
  let done = 0;

  await mapLimit(routes, CONCURRENCY, async (route) => {
    // Outbound and inbound are different stop sets on many routes; take both.
    const dirs = await Promise.all([
      tfl<TflSequence>(`/Line/${route.id}/Route/Sequence/outbound`),
      tfl<TflSequence>(`/Line/${route.id}/Route/Sequence/inbound`),
    ]);
    const stopsOnRoute: { external_id: string; branch: number; sequence: number }[] = [];
    const seen = new Set<string>();
    const geometry: unknown[] = [];
    let branchOffset = 0;

    for (const seq of dirs) {
      if (!seq) continue;
      for (const branch of seq.stopPointSequences) {
        const branchId = branchOffset + branch.branchId;
        branch.stopPoint.forEach((sp, i) => {
          const externalId = sp.stationId ?? sp.id;
          const key = `${externalId}:${branchId}`;
          if (seen.has(key)) return;
          seen.add(key);
          stopsOnRoute.push({ external_id: externalId, branch: branchId, sequence: i });
          if (!stops.has(externalId)) {
            stops.set(externalId, {
              external_id: externalId,
              name: cleanName(sp.name),
              lat: sp.lat,
              lon: sp.lon,
              hub_id: sp.topMostParentId?.startsWith('HUB') ? sp.topMostParentId : null,
            });
          }
        });
      }
      for (const s of seq.lineStrings) geometry.push(JSON.parse(s)[0]);
      branchOffset += 1000;
    }

    sequences.push({ lineId: route.id, stops: stopsOnRoute, geometry });
    done += 1;
    if (done % 25 === 0 || done === routes.length) console.log(`  ${done}/${routes.length} routes fetched`);
  });

  console.log(`Upserting ${stops.size} bus stops…`);
  const stopRows = [...stops.values()].map((s) => ({
    city_id: LONDON_ID,
    external_source: SOURCE,
    external_id: s.external_id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    modes: ['bus'],
    network: 'bus',
    hub_id: s.hub_id,
  }));
  for (let i = 0; i < stopRows.length; i += 500) {
    const { error } = await db.from('stations').upsert(stopRows.slice(i, i + 500), { onConflict: 'external_source,external_id' });
    if (error) throw error;
    if ((i / 500) % 10 === 0) console.log(`  ${Math.min(i + 500, stopRows.length)}/${stopRows.length}`);
  }

  console.log(`Upserting ${routes.length} routes…`);
  const { data: lines, error: lineErr } = await db
    .from('lines')
    .upsert(
      routes.map((r) => ({
        city_id: LONDON_ID,
        external_source: SOURCE,
        external_id: r.id,
        name: r.name,
        mode: 'bus',
        network: 'bus',
        colour: BUS_COLOUR,
        geometry: sequences.find((s) => s.lineId === r.id)?.geometry ?? null,
      })),
      { onConflict: 'external_source,external_id' },
    )
    .select('id, external_id');
  if (lineErr) throw lineErr;

  const { data: stations, error: stErr } = await db
    .from('stations')
    .select('id, external_id')
    .eq('external_source', SOURCE)
    .eq('network', 'bus')
    .limit(50000);
  if (stErr) throw stErr;
  const stationIdByExt = new Map(stations!.map((s) => [s.external_id, s.id]));

  console.log('Writing line_stations…');
  for (const seq of sequences) {
    const lineId = lines!.find((l) => l.external_id === seq.lineId)!.id;
    const rows = seq.stops
      .map((s) => ({ line_id: lineId, station_id: stationIdByExt.get(s.external_id), branch: s.branch, sequence: s.sequence }))
      .filter((r): r is { line_id: string; station_id: string; branch: number; sequence: number } => !!r.station_id);
    const { error: delErr } = await db.from('line_stations').delete().eq('line_id', lineId);
    if (delErr) throw delErr;
    for (let i = 0; i < rows.length; i += 500) {
      const { error: insErr } = await db.from('line_stations').insert(rows.slice(i, i + 500));
      if (insErr) throw insErr;
    }
  }

  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
