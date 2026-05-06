const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

/**
 * Cloud Function: When a notification document is created in Firestore,
 * look up the recipient's FCM token and send a push notification.
 *
 * This runs on Firebase's servers, so it works even when the user's
 * app is closed or their phone is off — the notification will be
 * delivered when their device comes back online (just like WhatsApp/Instagram).
 */
exports.sendPushNotification = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { recipientId, title, body, type } = data;
    if (!recipientId || !title || !body) return;

    const db = getFirestore();

    // Look up the recipient's FCM tokens
    const tokensSnapshot = await db
      .collection("fcmTokens")
      .where("userId", "==", recipientId)
      .get();

    if (tokensSnapshot.empty) {
      console.log(`No FCM tokens found for user ${recipientId}`);
      return;
    }

    const tokens = tokensSnapshot.docs.map((doc) => doc.data().token);

    // Build the FCM message
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        type: type || "general",
        notificationId: event.params.notificationId,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "taskmates_default",
          priority: "max",
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: "public",
        },
      },
    };

    // Send to all of the user's device tokens
    const messaging = getMessaging();
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging.send({ ...message, token }).catch((err) => {
          // If the token is invalid, remove it from Firestore
          if (
            err.code === "messaging/invalid-registration-token" ||
            err.code === "messaging/registration-token-not-registered"
          ) {
            const badDoc = tokensSnapshot.docs.find(
              (d) => d.data().token === token
            );
            if (badDoc) badDoc.ref.delete();
          }
          throw err;
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(`Sent ${sent}/${tokens.length} push notifications for ${type}`);
  }
);
