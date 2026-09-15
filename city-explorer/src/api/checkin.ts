import { supabase } from '../lib/supabase';

/**
 * Machine-readable failure reasons raised by the `check_in` database function.
 * Map these to user-facing copy in the UI; never show the raw message.
 */
export type CheckInFailure =
  | 'not_authenticated'
  | 'location_mocked'
  | 'location_inaccurate'
  | 'station_not_found'
  | 'too_far'
  | 'rate_limited'
  | 'implausible_speed'
  | 'photo_not_owned'
  | 'photo_upload_failed'
  | 'unknown';

export type CheckInResult = {
  visit_id: string;
  station_id: string;
  first_visit: boolean;
  station_visit_count: number;
  distance_m: number;
  new_achievements: string[];
};

export class CheckInError extends Error {
  constructor(public reason: CheckInFailure, public detail?: string) {
    super(reason);
  }
}

const KNOWN: CheckInFailure[] = [
  'not_authenticated', 'location_mocked', 'location_inaccurate', 'station_not_found',
  'too_far', 'rate_limited', 'implausible_speed', 'photo_not_owned',
];

export async function checkIn(input: {
  stationId: string;
  lat: number;
  lon: number;
  accuracyM: number;
  mocked?: boolean;
  photoPath?: string | null;
  caption?: string | null;
}): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_station_id: input.stationId,
    p_lat: input.lat,
    p_lon: input.lon,
    p_accuracy_m: input.accuracyM,
    p_mocked: input.mocked ?? false,
    p_photo_path: input.photoPath ?? undefined,
    p_caption: input.caption ?? undefined,
  });
  if (error) {
    const reason = KNOWN.find((k) => error.message === k) ?? 'unknown';
    throw new CheckInError(reason, error.details ?? error.message);
  }
  return data as CheckInResult;
}

/** User-facing copy for each failure reason. */
export const CHECK_IN_COPY: Record<CheckInFailure, string> = {
  not_authenticated: 'You need to be signed in to check in.',
  location_mocked: 'That location looks faked. Turn off mock location apps.',
  location_inaccurate: 'Your location is too imprecise right now. Try again outside or near a window.',
  station_not_found: 'That station is not in our data yet.',
  too_far: 'You are not close enough to this station yet.',
  rate_limited: 'You already checked in here recently. Come back in a bit.',
  implausible_speed: 'That was fast. Wait a moment before checking in again.',
  photo_not_owned: 'That photo could not be attached. Try again.',
  photo_upload_failed: 'The photo did not upload. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Same rule as the database: 150 m plus reported accuracy, capped at 100 m of bonus. */
export function unlockRadiusM(accuracyM: number): number {
  return 150 + Math.min(Math.max(accuracyM, 0), 100);
}
