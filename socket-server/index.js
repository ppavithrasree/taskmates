const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 10000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin = allowedOrigins.includes("*") ? "*" : allowedOrigins;
const app = express();
app.use(cors({ origin: corsOrigin }));

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "taskmates-presence" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

const users = new Map();
const socketUsers = new Map();
const groupTyping = new Map();

const statusFor = (userId) => {
  const item = users.get(userId);
  return {
    userId,
    username: item?.username,
    active: Boolean(item?.sockets?.size),
    lastSeen: item?.lastSeen,
  };
};

const broadcastPresence = (userId) => {
  io.emit("presence:update", statusFor(userId));
};

const cleanupTyping = (socket, userId) => {
  for (const [groupId, typingUsers] of groupTyping.entries()) {
    if (!typingUsers.delete(userId)) continue;
    io.to(`group:${groupId}`).emit("typing:update", { groupId, userIds: [...typingUsers] });
    if (typingUsers.size === 0) groupTyping.delete(groupId);
  }
};

io.use((socket, next) => {
  const userId = typeof socket.handshake.auth.userId === "string" ? socket.handshake.auth.userId : "";
  if (!userId) return next(new Error("Missing userId"));
  socket.data.userId = userId;
  socket.data.username = typeof socket.handshake.auth.username === "string" ? socket.handshake.auth.username : "";
  next();
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;
  const existing = users.get(userId) || { sockets: new Set(), lastSeen: undefined, username };
  existing.username = username || existing.username;
  existing.sockets.add(socket.id);
  existing.lastSeen = undefined;
  users.set(userId, existing);
  socketUsers.set(socket.id, userId);

  socket.emit("presence:snapshot", [...users.keys()].map(statusFor));
  broadcastPresence(userId);

  socket.on("groups:join", (groupIds) => {
    if (!Array.isArray(groupIds)) return;
    for (const room of socket.rooms) {
      if (room.startsWith("group:")) socket.leave(room);
    }
    groupIds.filter((id) => typeof id === "string").forEach((groupId) => {
      socket.join(`group:${groupId}`);
      const typingUsers = groupTyping.get(groupId);
      if (typingUsers?.size) {
        socket.emit("typing:update", { groupId, userIds: [...typingUsers] });
      }
    });
  });

  socket.on("typing:start", ({ groupId }) => {
    if (typeof groupId !== "string") return;
    const typingUsers = groupTyping.get(groupId) || new Set();
    typingUsers.add(userId);
    groupTyping.set(groupId, typingUsers);
    socket.to(`group:${groupId}`).emit("typing:update", { groupId, userIds: [...typingUsers] });
  });

  socket.on("typing:stop", ({ groupId }) => {
    if (typeof groupId !== "string") return;
    const typingUsers = groupTyping.get(groupId);
    if (!typingUsers) return;
    typingUsers.delete(userId);
    io.to(`group:${groupId}`).emit("typing:update", { groupId, userIds: [...typingUsers] });
    if (typingUsers.size === 0) groupTyping.delete(groupId);
  });

  socket.on("disconnect", () => {
    cleanupTyping(socket, userId);
    socketUsers.delete(socket.id);
    const item = users.get(userId);
    if (!item) return;
    item.sockets.delete(socket.id);
    if (item.sockets.size === 0) {
      item.lastSeen = Date.now();
    }
    broadcastPresence(userId);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TaskMates presence server listening on ${PORT}`);
});
