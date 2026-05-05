type LocalNotificationsModule = {
  LocalNotifications: {
    requestPermissions: () => Promise<unknown>;
    schedule: (options: unknown) => Promise<unknown>;
    cancel: (options: unknown) => Promise<unknown>;
  };
};

const loadCapacitorNotifications = async () => {
  try {
    const importer = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<LocalNotificationsModule>;
    return await importer("@capacitor/local-notifications");
  } catch {
    return null;
  }
};

const NOTIFICATION_ID = 2400;
const NOTIFICATION_TITLE = "TaskMates";
const NOTIFICATION_BODY = "You have unlogged activity gaps today. Open the app to fill them in!";

/**
 * Schedule a daily repeating notification at midnight (00:00).
 * On Capacitor (native), this uses LocalNotifications with a daily repeat.
 * On web, it falls back to a setTimeout that fires at next midnight.
 *
 * @param enabled - If false, cancels the scheduled notification
 */
export const scheduleDailyMidnightNotification = async (enabled: boolean) => {
  const native = await loadCapacitorNotifications();

  if (native) {
    await native.LocalNotifications.requestPermissions().catch(() => undefined);
    // Always cancel existing before rescheduling
    await native.LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => undefined);

    if (!enabled) return;

    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    await native.LocalNotifications.schedule({
      notifications: [
        {
          title: NOTIFICATION_TITLE,
          body: NOTIFICATION_BODY,
          id: NOTIFICATION_ID,
          schedule: {
            at: next,
            every: "day",
            allowWhileIdle: true,
          },
        },
      ],
    }).catch(() => undefined);
    return;
  }

  // Web fallback: schedule a one-shot at next midnight using setTimeout
  if (!enabled) return;

  if ("Notification" in window && Notification.permission !== "granted") {
    await Notification.requestPermission().catch(() => undefined);
  }

  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  const delay = next.getTime() - Date.now();

  if (delay > 0 && delay < 86_400_000) {
    setTimeout(() => {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY });
      }
    }, delay);
  }
};
