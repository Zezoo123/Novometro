import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_ID_KEY = 'streak-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for notification permission the first time the user does something
 * worth reminding them about (after a check-in, never on launch), then keeps
 * one daily 6 pm reminder scheduled.
 */
export async function ensureStreakReminder(streak: number): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;

    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID_KEY).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID_KEY,
      content: {
        title: streak > 1 ? `Keep your ${streak}-day streak alive 🔥` : 'One station a day',
        body: 'Check in at any station today to keep the streak going.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 0,
      },
    });
  } catch {
    // Reminders are a nicety; never let them break a check-in.
  }
}
