import type { TimeGap } from "@/types";

const NOTIFICATION_TITLE = "Daily activity gap";
const NOTIFICATION_BODY = "You missed logging activity for some time today";

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

export const notifyCoverageGap = async (gaps: TimeGap[]) => {
  void gaps;
  const native = await loadCapacitorNotifications();

  if (native) {
    await native.LocalNotifications.requestPermissions().catch(() => undefined);
    await native.LocalNotifications.schedule({
      notifications: [
        {
          title: NOTIFICATION_TITLE,
          body: NOTIFICATION_BODY,
          id: Date.now() % 2_147_483_647,
          schedule: { at: new Date(Date.now() + 1000) },
        },
      ],
    }).catch(() => undefined);
    return;
  }

  if ("Notification" in window) {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
    if (permission === "granted") new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY });
  }
};

export const scheduleCoverageReminderForNextMidnight = async (enabled: boolean) => {
  const native = await loadCapacitorNotifications();
  if (!native) return;

  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);

  await native.LocalNotifications.requestPermissions().catch(() => undefined);
  await native.LocalNotifications.cancel({ notifications: [{ id: 2400 }] }).catch(() => undefined);
  if (!enabled) return;

  await native.LocalNotifications.schedule({
    notifications: [
      {
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
        id: 2400,
        schedule: { at: next },
      },
    ],
  }).catch(() => undefined);
};
