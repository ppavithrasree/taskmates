const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// ── Initialize Firebase Admin SDK ──────────────────────────────
// Uses FIREBASE_SERVICE_ACCOUNT env var (JSON string of the service account key)
let db, messaging;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (Object.keys(serviceAccount).length > 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    db = admin.firestore();
    messaging = admin.messaging();
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT is empty. Notifications will fail.");
  }
} catch (err) {
  console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON. Is it formatted correctly?");
  console.error(err);
}

// ── Express Server ─────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-key"]
}));
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
 * Body: { recipientId, title, body, type, link }
 *
 * Looks up the recipient's FCM tokens from Firestore and sends
 * a high-priority push notification via FCM.
 */
app.post("/api/send-notification", authenticate, async (req, res) => {
  try {
    if (!db || !messaging) {
      return res.status(500).json({ error: "Firebase Admin is not configured. Check FIREBASE_SERVICE_ACCOUNT." });
    }

    const { recipientId, title, body, type, link } = req.body;

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

    const latestByDevice = new Map();
    for (const doc of tokensSnapshot.docs) {
      const data = doc.data();
      if (!data.token) continue;
      const deviceKey = data.installationId || data.platform || doc.id;
      const existing = latestByDevice.get(deviceKey);
      if (!existing || (data.updatedAt || 0) > (existing.data.updatedAt || 0)) {
        latestByDevice.set(deviceKey, { doc, data });
      }
    }
    const tokenEntries = [...latestByDevice.values()];
    const tokens = [...new Set(tokenEntries.map((entry) => entry.data.token))];

    // Send FCM push to all device tokens
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging
          .send({
            token,
            notification: { title, body },
            data: {
              type: type || "general",
              link: link || "",
            },
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
