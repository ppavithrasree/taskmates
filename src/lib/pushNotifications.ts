/**
 * Push Notifications (FCM) module.
 *
 * Registers the device for FCM push notifications and stores the token
 * in Firestore so the Cloud Function can send pushes to this device.
 * Works even when the app is closed — the OS handles delivery.
 */

type PushNotificationsModule = {
  PushNotifications: {
    requestPermissions: () => Promise<{ receive: string }>;
    register: () => Promise<void>;
    addListener: (event: string, callback: (data: unknown) => void) => Promise<{ remove: () => void }>;
  };
};

let cachedPush: PushNotificationsModule | null | undefined;

const loadPushModule = async (): Promise<PushNotificationsModule | null> => {
  if (cachedPush !== undefined) return cachedPush;
  try {
    const importer = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<PushNotificationsModule>;
    cachedPush = await importer("@capacitor/push-notifications");
    return cachedPush;
  } catch {
    cachedPush = null;
    return null;
  }
};

/**
 * Initialize FCM push notifications.
 * - Requests permission
 * - Registers with FCM
 * - Stores the device token in Firestore under `fcmTokens` collection
 * - Listens for incoming push notifications
 *
 * @param userId - The current user's ID
 * @param onNotificationReceived - Callback when a push is received while app is open
 */
export const initPushNotifications = async (
  userId: string,
  onNotificationReceived?: (title: string, body: string) => void
) => {
  const pushModule = await loadPushModule();
  if (!pushModule) return; // Not on native platform

  try {
    // Request permission
    const permResult = await pushModule.PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      console.warn("Push notification permission denied");
      return;
    }

    // Register with FCM
    await pushModule.PushNotifications.register();

    // Listen for the FCM token
    await pushModule.PushNotifications.addListener(
      "registration",
      async (tokenData: unknown) => {
        const token = (tokenData as { value?: string })?.value;
        if (!token) return;
        console.log("FCM token received:", token.slice(0, 20) + "...");

        // Store token in Firestore
        try {
          const { getApps, initializeApp } = await import("firebase/app");
          const { getFirestore, doc, setDoc } = await import("firebase/firestore");

          const app = getApps()[0];
          if (!app) return;
          const db = getFirestore(app);

          // Use a deterministic doc ID so we update rather than duplicate
          const tokenDocId = `${userId}_${token.slice(-12)}`;
          await setDoc(doc(db, "fcmTokens", tokenDocId), {
            userId,
            token,
            updatedAt: Date.now(),
            platform: "android",
          });
          console.log("FCM token stored in Firestore");
        } catch (err) {
          console.error("Failed to store FCM token:", err);
        }
      }
    );

    // Listen for registration errors
    await pushModule.PushNotifications.addListener(
      "registrationError",
      (err: unknown) => {
        console.error("FCM registration error:", err);
      }
    );

    // Listen for push notifications received while app is in foreground
    await pushModule.PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: unknown) => {
        const notif = notification as { title?: string; body?: string };
        if (notif.title && notif.body && onNotificationReceived) {
          onNotificationReceived(notif.title, notif.body);
        }
      }
    );

    // Listen for push notification tap (app was in background/closed)
    await pushModule.PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (_action: unknown) => {
        // The app is already opening, the notification page will handle navigation
      }
    );
  } catch (err) {
    console.error("Failed to initialize push notifications:", err);
  }
};
