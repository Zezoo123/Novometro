import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { fetchAchievementCatalogue } from '../api/achievements';
import { CHECK_IN_COPY, CheckInError, checkIn, type CheckInResult } from '../api/checkin';
import { deleteCheckInPhoto, uploadCheckInPhoto } from '../api/photos';
import type { Station } from '../api/stations';
import { ensureStreakReminder } from '../lib/reminders';
import { getFreshFix } from './useLocation';

export type CheckInNotice = { kind: 'ok' | 'error'; text: string; detail?: string; shareKey?: string };

/**
 * One place for the check-in side effects: fresh GPS fix, RPC, haptics,
 * copy, query invalidation, streak reminder. Used by the bar and the sheet.
 */
export function useCheckIn(userId: string | undefined) {
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: ['achievement-catalogue', 'v2'], queryFn: fetchAchievementCatalogue });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CheckInNotice | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  /** Achievement worth a full-screen moment (line / city / network), set once per check-in. */
  const [milestoneKey, setMilestoneKey] = useState<string | null>(null);

  const submit = useCallback(
    async (station: Station, photo?: { uri: string; caption?: string }): Promise<CheckInResult | null> => {
      setBusy(true);
      setNotice(null);
      let photoPath: string | null = null;
      try {
        const fresh = await getFreshFix();
        if (photo && userId) {
          try {
            photoPath = await uploadCheckInPhoto(userId, photo.uri);
          } catch {
            throw new CheckInError('photo_upload_failed');
          }
        }
        let result: CheckInResult;
        try {
          result = await checkIn({
            stationId: station.id,
            lat: fresh.lat,
            lon: fresh.lon,
            accuracyM: fresh.accuracyM,
            mocked: fresh.mocked,
            photoPath,
            caption: photo?.caption ?? null,
          });
        } catch (e) {
          if (photoPath) deleteCheckInPhoto(photoPath).catch(() => {});
          throw e;
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const names = result.new_achievements.map((key) => catalogue.data?.find((a) => a.key === key)?.name ?? key);
        setNotice({
          kind: 'ok',
          text: result.first_visit ? `${station.name} unlocked!` : `Visit #${result.station_visit_count} to ${station.name}`,
          detail: names.length ? `🏆 ${names.join(' · ')} · tap to share` : undefined,
          shareKey: result.new_achievements[0],
        });
        if (result.first_visit || result.new_achievements.length) setCelebrate(true);
        const milestone = result.new_achievements.find((k) => k.startsWith('line_complete:') || k === 'all_lines' || k === 'explorer:city');
        if (milestone) setMilestoneKey(milestone);

        const stats = queryClient.getQueryData<{ current_streak: number }>(['my-stats', userId]);
        ensureStreakReminder((stats?.current_streak ?? 0) + 1);

        for (const key of [['visits', userId], ['line-progress', userId], ['line-detail'], ['achievements', userId], ['my-stats', userId], ['leaderboard'], ['challenges', userId], ['feed'], ['station-wall', station.id], ['my-photos', userId]]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        return result;
      } catch (e) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const reason = e instanceof CheckInError ? e.reason : 'unknown';
        setNotice({ kind: 'error', text: CHECK_IN_COPY[reason] });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [catalogue.data, queryClient, userId],
  );

  return {
    submit,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    celebrate,
    endCelebration: () => setCelebrate(false),
    milestoneKey,
    clearMilestone: () => setMilestoneKey(null),
  };
}
