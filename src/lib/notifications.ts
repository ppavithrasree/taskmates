type LocalNotificationsModule = {
  LocalNotifications: {
    requestPermissions: () => Promise<{ display: string }>;
    checkPermissions: () => Promise<{ display: string }>;
    schedule: (options: unknown) => Promise<unknown>;
    cancel: (options: unknown) => Promise<unknown>;
    createChannel: (channel: unknown) => Promise<void>;
    addListener: (event: string, callback: (notification: unknown) => void) => Promise<{ remove: () => void }>;
  };
};

let cachedModule: LocalNotificationsModule | null | undefined;
let channelCreated = false;

const loadCapacitorNotifications = async (): Promise<LocalNotificationsModule | null> => {
  if (cachedModule !== undefined) return cachedModule;
  try {
    const importer = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<LocalNotificationsModule>;
    cachedModule = await importer("@capacitor/local-notifications");
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
};

const CHANNEL_ID = "taskmates_default";
const NOTIFICATION_BASE_ID = 2400;

/** Create a high-importance notification channel (Android 8+) */
const ensureChannel = async (native: LocalNotificationsModule) => {
  if (channelCreated) return;
  try {
    await native.LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "TaskMates Notifications",
      description: "Notifications from TaskMates",
      importance: 5, // MAX importance = heads-up popup
      visibility: 1, // PUBLIC
      sound: "default",
      vibration: true,
      lights: true,
    });
    channelCreated = true;
  } catch {
    // channel creation may fail on web or older devices
  }
};

/** Check and request notification permission. Returns true if granted. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  const native = await loadCapacitorNotifications();
  if (native) {
    try {
      await ensureChannel(native);
      const check = await native.LocalNotifications.checkPermissions();
      if (check.display === "granted") return true;
      const result = await native.LocalNotifications.requestPermissions();
      return result.display === "granted";
    } catch {
      return false;
    }
  }
  // Web fallback
  if ("Notification" in window) {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission().catch(() => "denied" as const);
    return result === "granted";
  }
  return false;
};

/** Check if notification permission is already granted (without prompting) */
export const hasNotificationPermission = async (): Promise<boolean> => {
  const native = await loadCapacitorNotifications();
  if (native) {
    try {
      const check = await native.LocalNotifications.checkPermissions();
      return check.display === "granted";
    } catch {
      return false;
    }
  }
  if ("Notification" in window) return Notification.permission === "granted";
  return false;
};

/** Show a native/web notification immediately with sound and vibration */
export const showLocalNotification = async (title: string, body: string, id?: number) => {
  const notifId = id ?? NOTIFICATION_BASE_ID + Math.floor(Math.random() * 10000);
  const native = await loadCapacitorNotifications();
  if (native) {
    try {
      await ensureChannel(native);
      await native.LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: notifId,
            channelId: CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true },
            sound: "default",
            smallIcon: "ic_stat_icon_config_sample",
            iconColor: "#0f9aa2",
            extra: null,
          },
        ],
      });
    } catch {
      // silently fail
    }
    return;
  }
  // Web fallback
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
};

/**
 * Schedule a daily repeating notification at midnight (00:00).
 * Uses high-importance channel with sound, vibration, and allowWhileIdle.
 * Works even when the app is closed and the phone is in Doze mode.
 */
export const scheduleDailyMidnightNotification = async (enabled: boolean, gapList?: string) => {
  const native = await loadCapacitorNotifications();
  const body = gapList
    ? `You have unlogged activity gaps: ${gapList}. Open the app to fill them in!`
    : "You have unlogged activity gaps today. Open the app to fill them in!";

  if (native) {
    await ensureChannel(native);
    await native.LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_BASE_ID }] }).catch(() => undefined);

    if (!enabled) return;

    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) return;

    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    await native.LocalNotifications.schedule({
      notifications: [
        {
          title: "TaskMates",
          body,
          id: NOTIFICATION_BASE_ID,
          channelId: CHANNEL_ID,
          schedule: {
            at: next,
            every: "day",
            allowWhileIdle: true,
          },
          sound: "default",
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#0f9aa2",
        },
      ],
    }).catch(() => undefined);
    return;
  }

  // Web fallback
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
        new Notification("TaskMates", { body });
      }
    }, delay);
  }
};
