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
 * Body: { recipientId, title, body, type, link, data }
 *
 * Looks up the recipient's FCM tokens from Firestore and sends
 * a high-priority push notification via FCM.
 * Group message delivery receipts are written only by the receiving app after
 * the device actually receives the push, or by the web client when it syncs.
 */
app.post("/api/send-notification", authenticate, async (req, res) => {
  try {
    if (!db || !messaging) {
      return res.status(500).json({ error: "Firebase Admin is not configured. Check FIREBASE_SERVICE_ACCOUNT." });
    }

    const { recipientId, title, body, type, link, data } = req.body;

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
            data: {
              type: type || "general",
              link: link || "",
              title,
              body,
              recipientId,
              ...(data && typeof data === "object" ? data : {}),
            },
            android: {
              priority: "high",
              ...(data?.messageId ? { collapseKey: String(data.messageId) } : {}),
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

/**
 * POST /api/mark-message-delivered
 * Body: { messageId, recipientId }
 *
 * Called by Android only after FCM delivers a group-message push to the device.
 */
app.post("/api/mark-message-delivered", authenticate, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "Firebase Admin is not configured. Check FIREBASE_SERVICE_ACCOUNT." });
    }

    const { messageId, recipientId } = req.body;
    if (!messageId || !recipientId) {
      return res.status(400).json({ error: "Missing messageId or recipientId" });
    }

    const messageRef = db.collection("groupMessages").doc(messageId);
    const snap = await messageRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Message not found" });

    const message = snap.data() || {};
    if (!Array.isArray(message.recipientIds) || !message.recipientIds.includes(recipientId)) {
      return res.status(403).json({ error: "Recipient is not allowed for this message" });
    }

    await messageRef.set({
      deliveredTo: admin.firestore.FieldValue.arrayUnion(recipientId),
      updatedAt: Date.now(),
    }, { merge: true });

    res.json({ ok: true });
  } catch (err) {
    console.error("Error marking message delivered:", err);
    res.status(500).json({ error: "Failed to mark message delivered" });
  }
});

// ── Start Server ───────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`FCM server running on port ${PORT}`);
});
