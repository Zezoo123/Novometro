import type { Feature, FeatureCollection, MultiLineString, Point } from 'geojson';
import type { Line, Station } from '../api/stations';

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
