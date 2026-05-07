import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

const CHANNEL_ID = "taskmates_alerts_v2";
const NOTIFICATION_BASE_ID = 2400;
let channelReady = false;

/** Create the high-importance notification channel (Android 8+) */
const ensureChannel = async () => {
  if (channelReady) return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "TaskMates Notifications",
      description: "Notifications from TaskMates app",
      importance: 5, // MAX — heads-up popup
      visibility: 1, // PUBLIC
      sound: undefined, // Use system default notification sound
      vibration: true,
      lights: true,
    });
    channelReady = true;
  } catch (err) {
    console.error("Failed to create notification channel:", err);
  }
};

/** Request notification permission. Returns true if granted. */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    try {
      await ensureChannel();
      const check = await LocalNotifications.checkPermissions();
      if (check.display === "granted") return true;
      const result = await LocalNotifications.requestPermissions();
      return result.display === "granted";
    } catch (err) {
      console.error("Permission request failed:", err);
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

/** Show a native notification immediately with sound + vibration */
export const showLocalNotification = async (title: string, body: string, id?: number) => {
  const notifId = id ?? NOTIFICATION_BASE_ID + Math.floor(Math.random() * 90000);

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureChannel();

      // Check permission first
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        console.warn("Notification permission not granted, requesting...");
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") {
          console.warn("Notification permission denied by user");
          return;
        }
      }

      console.log("Scheduling local notification:", title, body);
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: notifId,
            channelId: CHANNEL_ID,
            smallIcon: "ic_stat_icon_config_sample",
            largeIcon: "ic_launcher",
            iconColor: "#0f9aa2",
            schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
            extra: null,
          },
        ],
      });
      console.log("Local notification scheduled successfully, id:", notifId);
    } catch (err) {
      console.error("Failed to schedule notification:", err);
    }
    return;
  }

  // Web fallback
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
};

/** Schedule a daily midnight notification for unlogged gaps. Works even when app is closed. */
export const scheduleDailyMidnightNotification = async (enabled: boolean, gapList?: string) => {
  const body = gapList
    ? `You have unlogged activity gaps: ${gapList}. Open the app to fill them in!`
    : "You have unlogged activity gaps today. Open the app to fill them in!";

  if (Capacitor.isNativePlatform()) {
    await ensureChannel();
    // Cancel any existing scheduled midnight notification
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_BASE_ID }] }).catch(() => undefined);

    if (!enabled) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;

    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    await LocalNotifications.schedule({
      notifications: [
        {
          title: "TaskMates — Activity Gaps",
          body,
          id: NOTIFICATION_BASE_ID,
          channelId: CHANNEL_ID,
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#0f9aa2",
          schedule: {
            at: next,
            every: "day",
            allowWhileIdle: true,
          },
        },
      ],
    }).catch((err) => console.error("Failed to schedule midnight notification:", err));
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
