const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// ── Initialize Firebase Admin SDK ──────────────────────────────
// Uses FIREBASE_SERVICE_ACCOUNT env var (JSON string of the service account key)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const messaging = admin.messaging();

// ── Express Server ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Simple API key authentication
const API_KEY = process.env.API_KEY || "";

const authenticate = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!API_KEY || key === API_KEY) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "taskmates-fcm" });
});

/**
 * POST /api/send-notification
 * Body: { recipientId, title, body, type }
 *
 * Looks up the recipient's FCM tokens from Firestore and sends
 * a high-priority push notification via FCM.
 */
app.post("/api/send-notification", authenticate, async (req, res) => {
  try {
    const { recipientId, title, body, type } = req.body;

    if (!recipientId || !title || !body) {
      return res.status(400).json({ error: "Missing recipientId, title, or body" });
    }

    // Look up recipient's FCM tokens
    const tokensSnapshot = await db
      .collection("fcmTokens")
      .where("userId", "==", recipientId)
      .get();

    if (tokensSnapshot.empty) {
      return res.json({ sent: 0, message: "No FCM tokens found for recipient" });
    }

    const tokens = tokensSnapshot.docs.map((doc) => doc.data().token);

    // Send FCM push to all device tokens
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging
          .send({
            token,
            notification: { title, body },
            data: { type: type || "general" },
            android: {
              priority: "high",
              notification: {
                channelId: "taskmates_alerts_v2",
                priority: "max",
                defaultSound: true,
                defaultVibrateTimings: true,
                visibility: "PUBLIC",
              },
            },
          })
          .catch((err) => {
            // Remove invalid tokens
            if (
              err.code === "messaging/invalid-registration-token" ||
              err.code === "messaging/registration-token-not-registered"
            ) {
              const badDoc = tokensSnapshot.docs.find((d) => d.data().token === token);
              if (badDoc) badDoc.ref.delete();
            }
            throw err;
          })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(`Sent ${sent}/${tokens.length} FCM pushes for ${type} to ${recipientId}`);
    res.json({ sent, total: tokens.length });
  } catch (err) {
    console.error("Error sending notification:", err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// ── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`FCM server running on port ${PORT}`);
});
