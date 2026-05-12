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

export const connectPresence = (user: User, groups: Group[], handlers: PresenceHandlers) => {
  const url = import.meta.env.VITE_SOCKET_URL as string | undefined;
  if (!url) return () => undefined;

  socket?.disconnect();
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
    socket?.emit("groups:join", groups.map((group) => group.id));
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
  };
};

export const updatePresenceGroups = (groups: Group[]) => {
  socket?.emit("groups:join", groups.map((group) => group.id));
};

export const emitTyping = (groupId: string, typing: boolean) => {
  socket?.emit(typing ? "typing:start" : "typing:stop", { groupId });
};
