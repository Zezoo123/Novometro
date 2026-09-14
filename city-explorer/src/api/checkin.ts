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
  'too_far', 'rate_limited', 'implausible_speed',
];

export async function checkIn(input: {
  stationId: string;
  lat: number;
  lon: number;
  accuracyM: number;
  mocked?: boolean;
}): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_station_id: input.stationId,
    p_lat: input.lat,
    p_lon: input.lon,
    p_accuracy_m: input.accuracyM,
    p_mocked: input.mocked ?? false,
  });
  if (error) {
    const reason = KNOWN.find((k) => error.message === k) ?? 'unknown';
    throw new CheckInError(reason, error.details ?? error.message);
  }
  return data as CheckInResult;
}
