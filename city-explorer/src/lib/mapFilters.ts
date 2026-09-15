import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Transit modes the map can show. Matches `lines.mode` / `stations.modes`. */
export const MODES = ['tube', 'dlr', 'overground', 'elizabeth-line', 'bus'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  tube: 'Tube',
  dlr: 'DLR',
  overground: 'Overground',
  'elizabeth-line': 'Elizabeth',
  bus: 'Bus',
};

export const MODE_COLOUR: Record<Mode, string> = {
  tube: '#0019A8',
  dlr: '#00A4A7',
  overground: '#EE7C0E',
  'elizabeth-line': '#6950A1',
  bus: '#DC241F',
};

/** Bus is off by default: 19k stops would drown the rail network. */
export const DEFAULT_MODES: Mode[] = ['tube', 'dlr', 'overground', 'elizabeth-line'];

const KEY = 'novometro.mapModes.v1';

export function useMapModes() {
  const [modes, setModes] = useState<Mode[]>(DEFAULT_MODES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((m): m is Mode => (MODES as readonly string[]).includes(m));
          if (valid.length) setModes(valid);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = useCallback((mode: Mode) => {
    setModes((prev) => {
      const next = prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode];
      // Never allow an empty map.
      const result = next.length ? next : prev;
      AsyncStorage.setItem(KEY, JSON.stringify(result)).catch(() => {});
      return result;
    });
  }, []);

  return { modes, toggle, loaded };
}

export function stationMatches(stationModes: string[], selected: Mode[]): boolean {
  return stationModes.some((m) => (selected as string[]).includes(m));
}
