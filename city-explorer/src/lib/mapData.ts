import type { Feature, FeatureCollection, MultiLineString, Point } from 'geojson';
import type { Line, LineStation, Station } from '../api/stations';

export type StationProps = { id: string; name: string; unlocked: boolean; visits: number; network: string };
export type LineProps = { id: string; name: string; colour: string };

const FALLBACK_COLOUR = '#6b7280';

export function stationsToGeoJSON(
  stations: Station[],
  visits: Map<string, { visits: number }>,
): FeatureCollection<Point, StationProps> {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      id: s.id,
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.id, name: s.name, unlocked: visits.has(s.id), visits: visits.get(s.id)?.visits ?? 0, network: s.network },
    })),
  };
}

export function linesToGeoJSON(lines: Line[]): FeatureCollection<MultiLineString, LineProps> {
  const features: Feature<MultiLineString, LineProps>[] = [];
  for (const l of lines) {
    const coords = l.geometry as [number, number][][] | null;
    if (!coords?.length) continue;
    features.push({
      type: 'Feature',
      id: l.id,
      geometry: { type: 'MultiLineString', coordinates: coords },
      properties: { id: l.id, name: l.name, colour: l.colour ?? FALLBACK_COLOUR },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** station_id -> lines serving it, in a stable order. */
export function linesByStation(lineStations: LineStation[], lines: Line[]): Map<string, Line[]> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out = new Map<string, Line[]>();
  for (const ls of lineStations) {
    const line = byId.get(ls.line_id);
    if (!line) continue;
    const arr = out.get(ls.station_id) ?? [];
    if (!arr.some((x) => x.id === line.id)) arr.push(line);
    out.set(ls.station_id, arr);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
