/**
 * FCM Push Notifications — Client-side module.
 *
 * 1. Registers the device with FCM and stores the token in Firestore
 * 2. Sends push notifications via the free FCM server
 *
 * Works when the app is closed and the phone screen is off.
 * Local notifications (in notifications.ts) handle scheduled/recurring reminders.
 */
import { Capacitor } from "@capacitor/core";

// FCM server URL — set in .env as VITE_FCM_SERVER_URL
const FCM_SERVER_URL = import.meta.env.VITE_FCM_SERVER_URL || "";
const FCM_API_KEY = import.meta.env.VITE_FCM_API_KEY || "";

type PushModule = {
  PushNotifications: {
    requestPermissions: () => Promise<{ receive: string }>;
    register: () => Promise<void>;
    removeAllDeliveredNotifications: () => Promise<void>;
    addListener: (event: string, cb: (data: unknown) => void) => Promise<{ remove: () => void }>;
  };
};

let pushModule: PushModule | null = null;
let activePath = "/";
let initializedUserId: string | null = null;
let listenerHandles: { remove: () => void }[] = [];
let navigationHandler: ((path: string) => void) | null = null;

export const setActivePushPath = (pathname: string) => {
  activePath = pathname;
};

export const setPushNotificationNavigationHandler = (handler: ((path: string) => void) | null) => {
  navigationHandler = handler;
};

export const pathForNotification = (data?: { type?: string; link?: string } | null) => {
  if (!data) return "/dashboard";
  if ((data.type === "group_message" || data.type === "group_reaction") && data.link?.startsWith("/groups/")) return data.link;
  if ((data.type === "post_like" || data.type === "post_comment") && data.link) return data.link;
  if (data.type === "task_reminder") return data.link || "/tasks";
  if (data.type === "connection_request" || data.type === "connection_accepted") return "/friends";
  if (data.type === "unlogged_gaps") return "/dashboard";
  return data.link || "/dashboard";
};

export const clearDeliveredPushNotifications = async () => {
  const mod = await loadPush();
  if (!mod) return;
  await mod.PushNotifications.removeAllDeliveredNotifications().catch(() => undefined);
};

const navigateFromNotificationData = (data?: { type?: string; link?: string } | null) => {
  navigationHandler?.(pathForNotification(data));
  void clearDeliveredPushNotifications();
};

const loadPush = async (): Promise<PushModule | null> => {
  if (pushModule) return pushModule;
  if (!Capacitor.isNativePlatform()) return null;
  try {
    pushModule = await import("@capacitor/push-notifications") as unknown as PushModule;
    return pushModule;
  } catch {
    return null;
  }
};

/**
 * Initialize FCM: request permission, register, and store token in Firestore.
 * Call this once after the user logs in.
 */
export const initFCMPush = async (
  userId: string,
  onForegroundPush?: (title: string, body: string, data?: { type?: string; link?: string }) => void
): Promise<void> => {
  const mod = await loadPush();
  if (!mod) return;

  for (const handle of listenerHandles) {
    handle.remove();
  }
  listenerHandles = [];
  initializedUserId = userId;

  try {
    const perm = await mod.PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      console.warn("FCM notification permission denied; registering for data delivery anyway");
    }

    await mod.PushNotifications.register();

    // Listen for FCM token
    listenerHandles.push(await mod.PushNotifications.addListener("registration", async (data: unknown) => {
      const token = (data as { value?: string })?.value;
      if (!token) return;
      console.log("FCM token:", token.slice(0, 20) + "...");

      // Store token in Firestore
      try {
        const { getApps } = await import("firebase/app");
        const { collection, doc, getDocs, getFirestore, query, setDoc, where, writeBatch } = await import("firebase/firestore");
        const fbApp = getApps()[0];
        if (!fbApp) return;
        const db = getFirestore(fbApp);
        const installationId = localStorage.getItem("taskmates_installation_id") ?? crypto.randomUUID();
        localStorage.setItem("taskmates_installation_id", installationId);
        const tokenDocId = `${userId}_${installationId}`;
        const existingTokens = await getDocs(query(collection(db, "fcmTokens"), where("userId", "==", userId)));
        const batch = writeBatch(db);
        existingTokens.docs.forEach((item) => {
          const data = item.data();
          if (item.id !== tokenDocId && (data.installationId === installationId || data.token === token)) {
            batch.delete(item.ref);
          }
        });
        await batch.commit();
        await setDoc(doc(db, "fcmTokens", tokenDocId), {
          userId,
          token,
          installationId,
          updatedAt: Date.now(),
          platform: "android",
        });
        console.log("FCM token stored in Firestore");
      } catch (err) {
        console.error("Failed to store FCM token:", err);
      }
    }));

    // Registration error
    listenerHandles.push(await mod.PushNotifications.addListener("registrationError", (err: unknown) => {
      console.error("FCM registration error:", err);
    }));

    // Push received while app is in foreground
    listenerHandles.push(await mod.PushNotifications.addListener("pushNotificationReceived", (notif: unknown) => {
      const n = notif as { title?: string; body?: string; data?: { type?: string; link?: string; title?: string; body?: string } };
      if ((n.data?.type === "group_message" || n.data?.type === "group_reaction") && n.data.link === activePath) return;
      const title = n.title ?? n.data?.title;
      const body = n.body ?? n.data?.body;
      if (title && body && onForegroundPush) {
        onForegroundPush(title, body, n.data);
      }
    }));

    // Push tapped (app was in background/closed)
    listenerHandles.push(await mod.PushNotifications.addListener("pushNotificationActionPerformed", (action: unknown) => {
      const notification = (action as { notification?: { data?: { type?: string; link?: string } } })?.notification;
      navigateFromNotificationData(notification?.data);
    }));
  } catch (err) {
    initializedUserId = null;
    console.error("FCM init error:", err);
  }
};

/**
 * Send a push notification via the free FCM server.
 * Call this when creating a notification for another user (friend request, group message, etc.)
 */
export const sendFCMPush = async (
  recipientId: string,
  title: string,
  body: string,
  type: string,
  link?: string,
  extraData?: Record<string, string>
): Promise<boolean> => {
  if (!FCM_SERVER_URL) {
    console.warn("FCM_SERVER_URL not configured — push notification not sent");
    return false;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (FCM_API_KEY) headers["x-api-key"] = FCM_API_KEY;

    const resp = await fetch(`${FCM_SERVER_URL}/api/send-notification`, {
      method: "POST",
      headers,
      body: JSON.stringify({ recipientId, title, body, type, link, data: extraData }),
    });

    if (!resp.ok) {
      console.error("FCM server error:", resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (err) {
    // Silently fail — push is best-effort, local notification is the fallback
    console.warn("Failed to send FCM push (offline?):", err);
    return false;
  }
};
