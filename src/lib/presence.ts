import { io, type Socket } from "socket.io-client";
import type { Group, User } from "@/types";

export type PresenceStatus = {
  userId: string;
  username?: string;
  active: boolean;
  lastSeen?: number;
};

type PresenceHandlers = {
  onPresence: (items: PresenceStatus[]) => void;
  onTyping: (groupId: string, userIds: string[]) => void;
};

let socket: Socket | null = null;
let connectedUserId: string | null = null;
let currentGroupIds: string[] = [];

const sameGroupIds = (next: string[]) =>
  next.length === currentGroupIds.length && next.every((id, index) => currentGroupIds[index] === id);

const groupIdsFor = (groups: Group[]) => [...new Set(groups.map((group) => group.id))].sort();

export const connectPresence = (user: User, groups: Group[], handlers: PresenceHandlers) => {
  const url = import.meta.env.VITE_SOCKET_URL as string | undefined;
  if (!url) return () => undefined;

  const groupIds = groupIdsFor(groups);
  if (socket && connectedUserId === user.id) {
    updatePresenceGroups(groups);
    return () => undefined;
  }

  socket?.disconnect();
  connectedUserId = user.id;
  currentGroupIds = groupIds;
  socket = io(url, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    auth: {
      userId: user.id,
      username: user.username,
    },
  });

  const joinGroups = () => {
    socket?.emit("groups:join", currentGroupIds);
  };

  socket.on("connect", joinGroups);
  socket.on("presence:snapshot", handlers.onPresence);
  socket.on("presence:update", (item: PresenceStatus) => handlers.onPresence([item]));
  socket.on("typing:update", ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
    handlers.onTyping(groupId, userIds);
  });

  joinGroups();

  return () => {
    socket?.disconnect();
    socket = null;
    connectedUserId = null;
    currentGroupIds = [];
  };
};

export const updatePresenceGroups = (groups: Group[]) => {
  const groupIds = groupIdsFor(groups);
  if (sameGroupIds(groupIds)) return;
  currentGroupIds = groupIds;
  socket?.emit("groups:join", currentGroupIds);
};

export const emitTyping = (groupId: string, typing: boolean) => {
  socket?.emit(typing ? "typing:start" : "typing:stop", { groupId });
};
