// scripts/import_tfl_stations.ts
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const TFL_APP_ID    = process.env.TFL_APP_ID!;
const TFL_APP_KEY   = process.env.TFL_APP_KEY!;
const LONDON_ID     = '00000000-0000-0000-0000-000000000001'; // <- your London city_id

// Modes to import. Start with Tube, then add others.
const MODES = ['tube']; // add 'national-rail' later if you want  ## , 'dlr', 'overground', 'elizabeth-line', 'tram'

type StopPoint = {
  naptanId: string;
  stationNaptan?: string;
  stopType?: string;
  commonName: string;
  lat: number;
  lon: number;
  lines?: { id: string; name: string }[];
  lineModeGroups?: { modeName: string; lineIds: string[] }[];
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function uniq<T>(arr: T[]) {
  return Array.from(new Map(arr.map(v => [JSON.stringify(v), v])).values());
}

async function fetchMode(mode: string): Promise<StopPoint[]> {
  const base = `https://api.tfl.gov.uk/StopPoint/Mode/${encodeURIComponent(mode)}`;
  const url = process.env.TFL_APP_KEY
    ? `${base}?app_key=${encodeURIComponent(process.env.TFL_APP_KEY!)}`
    : base;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      // retry on 429/5xx
      if (res.status === 429 || res.status >= 500) {
        const delay = 800 * Math.pow(2, attempt);
        console.warn(`[${mode}] ${res.status} ${res.statusText} – retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`[${mode}] ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }

    let json: any;
    try {
      json = text ? JSON.parse(text) : [];
    } catch (e) {
      throw new Error(`[${mode}] JSON parse error: ${String(e)}. Body: ${text.slice(0, 200)}`);
    }

    // Normalize: accept array or object with stopPoints
    const arr: any[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.stopPoints)
      ? json.stopPoints
      : [];

    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn(`[${mode}] Unexpected response shape or empty. Sample: ${text.slice(0, 200)}`);
      return []; // don’t crash the whole run
    }

    // Keep station-level features only
    const filtered = arr.filter(
      (sp: StopPoint) =>
        (sp.stationNaptan || sp.naptanId) &&
        (sp.stopType?.includes('Station') || sp.stopType?.includes('MetroStation'))
    ) as StopPoint[];

    console.log(`[${mode}] received ${arr.length}, kept ${filtered.length}`);
    return filtered;
  }

  throw new Error(`[${mode}] failed after retries (rate limited)`);
}


async function run() {
  console.log('Fetching from TfL…');
  const all = (await Promise.all(MODES.map(fetchMode))).flat();

  // Deduplicate by **station** NaPTAN (prefer stationNaptan over naptanId)
  const byId = new Map<string, StopPoint>();
  for (const sp of all) {
    const id = sp.stationNaptan || sp.naptanId;
    if (!byId.has(id)) byId.set(id, sp);
  }
  const stations = Array.from(byId.values());

  // Map to DB rows
  const rows = stations.map(sp => {
    const lineIds = uniq([
      ...(sp.lines?.map(l => l.id) ?? []),
      ...((sp.lineModeGroups ?? []).flatMap(g => g.lineIds) ?? [])
    ]);
    const modes = uniq((sp.lineModeGroups ?? []).map(g => g.modeName));

    return {
      city_id: LONDON_ID,
      name: sp.commonName,
      lat: sp.lat,
      lon: sp.lon,
      external_source: 'tfl',
      external_id: sp.stationNaptan || sp.naptanId,
      modes,
      line_ids: lineIds,
    };
  });

  console.log(`Upserting ${rows.length} stations…`);
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase
      .from('stations')
      .upsert(slice, { onConflict: 'external_source,external_id' });
    if (error) throw error;
    console.log(`  ${Math.min(i + chunk, rows.length)} / ${rows.length}`);
  }

  console.log('Done.');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});