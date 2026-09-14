import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type Fix = {
  lat: number;
  lon: number;
  accuracyM: number;
  /** Android reports whether a mock provider produced the fix. */
  mocked: boolean;
  at: number;
};

export function toFix(pos: Location.LocationObject): Fix {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? 999,
    mocked: pos.mocked ?? false,
    at: pos.timestamp,
  };
}

/**
 * Requests foreground permission and, once granted, watches the position at
 * a cadence suited to walking. `fix` is null until the first reading.
 */
export function useLocation() {
  const [status, setStatus] = useState<Location.PermissionStatus | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setStatus(status);
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (pos) => setFix(toFix(pos)),
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return { status, fix, granted: status === 'granted' };
}

/** A fresh, high-accuracy reading for the moment of check-in. */
export async function getFreshFix(): Promise<Fix> {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  return toFix(pos);
}
