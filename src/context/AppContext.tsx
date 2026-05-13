import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppNotification, AppState, AuthResult, Connection, Group, GroupMessage, Post, PostComment, SyncCollection, SyncOperation, User, Visibility } from "@/types";
import {
  firebaseChangePassword,
  firebaseCreateAccount,
  firebaseGetUser,
  firebaseLogin,
  hasFirebaseConfig,
  pushSyncOperation,
  firebaseSignOut,
  subscribeFirebaseState,
  usernameToEmail,
  checkFirebasePostsExist,
} from "@/lib/firebaseSync";
import { analyzeDayCoverage, dateKey, isValidPostRange, postsInLocalDay, startOfLocalDay, unloggedGapsBody } from "@/lib/timeCoverage";
import { requestNotificationPermission, scheduleDailyMidnightNotification, showLocalNotification } from "@/lib/notifications";
import { initFCMPush, sendFCMPush } from "@/lib/pushNotifications";
import {
  cacheGroupKey,
  clearCachedGroupKey,
  decryptGroupKeyForUser,
  decryptMessageContent,
  decryptWrappedKeyForUser,
  encryptedKeysForMembers,
  encryptMessageContent,
  ensureEncryptionIdentity,
  generateGroupKey,
  getCachedGroupKey,
  publicKeyString,
} from "@/lib/e2eEncryption";
import { connectPresence, emitTyping as emitSocketTyping, updatePresenceGroups, type PresenceStatus } from "@/lib/presence";

const LS_KEY = "taskmates_activity_state_v1";
const SESSION_KEY = "taskmates_activity_session_v1";
const TOKEN_KEY = "taskmates_firebase_token_v1";
const LAST_SEEN_KEY = "taskmates_last_seen_cache_v1";
const DEFAULT_THEME: "light" | "dark" = "dark";

interface AppContextValue {
  currentUser: User | null;
  users: User[];
  posts: Post[];
  connections: Connection[];
  groups: Group[];
  groupMessages: GroupMessage[];
  notifications: AppNotification[];
  settings: AppState["settings"];
  syncPendingCount: number;
  online: boolean;
  register: (username: string, password: string, confirmPassword: string) => Promise<AuthResult>;
  login: (username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  changePassword: (password: string) => AuthResult;
  searchUsers: (query: string) => User[];
  sendRequest: (toId: string) => void;
  respondRequest: (requestId: string, accept: boolean) => void;
  deleteConnection: (userId: string) => void;
  getAcceptedConnectionIds: (userId: string) => string[];
  getConnectionStatus: (otherId: string) => "self" | "connected" | "incoming" | "outgoing" | "none";
  createGroup: (input: { name: string; memberIds: string[] }) => AuthResult;
  updateGroupName: (groupId: string, name: string) => AuthResult;
  addGroupMembers: (groupId: string, memberIds: string[]) => AuthResult;
  removeGroupMember: (groupId: string, memberId: string) => AuthResult;
  exitGroup: (groupId: string) => AuthResult;
  addGroupMessage: (groupId: string, content: string, replyToMessageId?: string) => Promise<AuthResult>;
  updateGroupMessage: (messageId: string, content: string) => Promise<AuthResult>;
  deleteGroupMessage: (messageId: string) => AuthResult;
  clearGroupChat: (groupId: string) => AuthResult;
  toggleGroupMessagePin: (messageId: string) => AuthResult;
  toggleGroupMessageReaction: (messageId: string, reaction: string) => AuthResult;
  markGroupMessagesRead: (groupId: string) => void;
  markGroupNotificationsRead: (groupId: string) => void;
  markNotificationsForLinkRead: (link: string) => void;
  setActiveGroupChat: (groupId: string | null) => void;
  toggleMuteGroup: (groupId: string) => void;
  isGroupMuted: (groupId: string) => boolean;
  addPost: (input: { startTime: number; endTime: number; content: string; visibility?: Visibility; customUsernames?: string[] }) => AuthResult;
  updatePost: (id: string, patch: Partial<Pick<Post, "startTime" | "endTime" | "content" | "visibility" | "customUsernames">>) => AuthResult;
  deletePost: (id: string) => void;
  togglePostLike: (postId: string) => AuthResult;
  addPostComment: (postId: string, content: string) => AuthResult;
  updatePostComment: (postId: string, commentId: string, content: string) => AuthResult;
  deletePostComment: (postId: string, commentId: string) => AuthResult;
  updateUserSettings: (patch: Partial<Pick<User, "privacy" | "customUsernames" | "retentionDays" | "notificationsEnabled">>) => void;
  updateTheme: (theme: "light" | "dark") => void;
  updateTimeFormat: (format: "12" | "24") => void;
  runRetentionCleanup: () => void;
  markNotificationsRead: () => void;
  unreadNotificationCount: number;
  pendingRequestCount: number;
  unreadGroupCount: number;
  presenceByUserId: Record<string, PresenceStatus>;
  typingByGroupId: Record<string, string[]>;
  emitTyping: (groupId: string, typing: boolean) => void;
  visibleFeedPosts: Post[];
  visibleGroups: Group[];
}

const AppContext = createContext<AppContextValue | null>(null);

const uid = (prefix = "id") => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const hashPassword = (password: string) => btoa(unescape(encodeURIComponent(password)));

const loadLastSeenCache = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
};

const saveLastSeenCache = (cache: Record<string, number>) => {
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(cache));
};

const emptyState = (): AppState => ({
  users: [],
  posts: [],
  connections: [],
  groups: [],
  groupMessages: [],
  notifications: [],
  syncQueue: [],
  settings: { theme: DEFAULT_THEME, timeFormat: "24" },
});

const makeUser = (id: string, username: string, createdAt: number, password: string): User => ({
  id,
  username,
  email: usernameToEmail(username),
  privacy: "public",
  customUsernames: [],
  retentionDays: 15,
  createdAt,
  updatedAt: createdAt,
  passwordHash: hashPassword(password),
});

const makePost = (id: string, userId: string, startTime: number, endTime: number, content: string, visibility: Visibility): Post => ({
  id,
  userId,
  startTime,
  endTime,
  content,
  visibility,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const load = (): AppState => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const initial = emptyState();
      localStorage.setItem(LS_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as AppState;
    // Clean out demo-only data when Firebase is configured
    const isDemoOnly =
      hasFirebaseConfig &&
      parsed.users.length > 0 &&
      parsed.users.every((user) => ["u_aria", "u_maya", "u_julian"].includes(user.id));
    const nextSettings = {
      ...parsed.settings,
      theme: parsed.settings?.theme ?? DEFAULT_THEME,
      timeFormat: parsed.settings?.timeFormat ?? "24",
    };
    if (isDemoOnly) return { ...emptyState(), settings: nextSettings };
    // Remove soft-deleted posts from local state on load
    return {
      ...parsed,
      posts: (parsed.posts ?? []).filter((p) => !p.deletedAt),
      connections: (parsed.connections ?? []).filter((c) => c.status !== "rejected"),
      groups: parsed.groups ?? [],
      groupMessages: parsed.groupMessages ?? [],
      notifications: parsed.notifications ?? [],
      settings: nextSettings,
    };
  } catch {
    return emptyState();
  }
};

const queueFor = (collection: SyncCollection, type: "upsert" | "delete", entityId: string, payload?: unknown) => ({
  id: uid("sync"),
  collection,
  type,
  entityId,
  payload,
  updatedAt: Date.now(),
});

const clearDirtyItems = <T extends { id: string; dirty?: boolean }>(items: T[], ids: Set<string>) =>
  ids.size ? items.map((item) => ids.has(item.id) ? { ...item, dirty: false } : item) : items;

const clearSyncedDirtyFlags = (snapshot: AppState, operations: SyncOperation[]): AppState => {
  const upserts = operations.filter((operation) => operation.type === "upsert");
  if (upserts.length === 0) return snapshot;

  const idsFor = (collection: SyncCollection) =>
    new Set(upserts.filter((operation) => operation.collection === collection).map((operation) => operation.entityId));

  return {
    ...snapshot,
    users: clearDirtyItems(snapshot.users, idsFor("users")),
    posts: clearDirtyItems(snapshot.posts, idsFor("posts")),
    connections: clearDirtyItems(snapshot.connections, idsFor("connections")),
    groups: clearDirtyItems(snapshot.groups, idsFor("groups")),
    groupMessages: clearDirtyItems(snapshot.groupMessages, idsFor("groupMessages")),
    notifications: clearDirtyItems(snapshot.notifications, idsFor("notifications")),
  };
};

/** Derive accepted connection user IDs from the connections collection */
const deriveAcceptedIds = (connections: Connection[], userId: string): string[] => {
  const ids: string[] = [];
  for (const c of connections) {
    if (c.status !== "accepted") continue;
    if (c.senderId === userId) ids.push(c.receiverId);
    else if (c.receiverId === userId) ids.push(c.senderId);
  }
  return ids;
};

const postVisibleTo = (post: Post, author: User | undefined, viewer: User, connectedIds: Set<string>) => {
  if (post.deletedAt) return false;
  if (post.userId === viewer.id) return true;
  const visibility = post.visibility ?? author?.privacy ?? "public";
  if (visibility === "public") return true;
  if (visibility === "connections") return connectedIds.has(post.userId);
  return (post.customUsernames ?? author?.customUsernames ?? []).includes(viewer.username);
};

const mergeByFreshness = <T extends { id: string; updatedAt: number; dirty?: boolean }>(local: T[], remote: T[]) => {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing || (!existing.dirty && item.updatedAt >= existing.updatedAt)) {
      map.set(item.id, { ...item, dirty: false });
    }
  }
  return [...map.values()];
};

const remoteWithPendingLocal = <T extends { id: string; dirty?: boolean }>(local: T[], remote: T[]) => {
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const dirtyLocal = local.filter((item) => item.dirty && !remoteMap.has(item.id));
  return [...remote, ...dirtyLocal.map((item) => ({ ...item }))];
};

const mergeIds = (a?: string[], b?: string[]) => [...new Set([...(a ?? []), ...(b ?? [])])];

const sameIds = (a?: string[], b?: string[]) => {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
};

const mergeComments = (a?: PostComment[], b?: PostComment[]) => {
  const map = new Map<string, PostComment>();
  for (const comment of [...(a ?? []), ...(b ?? [])]) {
    const existing = map.get(comment.id);
    if (!existing || comment.updatedAt >= existing.updatedAt) map.set(comment.id, comment);
  }
  return [...map.values()].sort((left, right) => left.createdAt - right.createdAt);
};

const sameMap = (a?: Record<string, string>, b?: Record<string, string>) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

const mergePosts = (local: Post[], remote: Post[]) => {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, dirty: false });
      continue;
    }
    if (!existing.dirty && item.updatedAt >= existing.updatedAt) {
      map.set(item.id, { ...item, dirty: false });
      continue;
    }
    map.set(item.id, {
      ...existing,
      likes: item.updatedAt >= existing.updatedAt
        ? (item.likes ?? existing.likes)
        : sameIds(existing.likes, item.likes)
        ? existing.likes
        : mergeIds(existing.likes, item.likes),
      reactions: item.updatedAt >= existing.updatedAt ? (item.reactions ?? existing.reactions) : (existing.reactions ?? item.reactions),
      comments: item.updatedAt >= existing.updatedAt ? (item.comments ?? []) : mergeComments(existing.comments, item.comments),
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
      dirty: item.updatedAt >= existing.updatedAt ? false : existing.dirty,
    });
  }
  return [...map.values()];
};

const mergeGroupMessages = (local: GroupMessage[], remote: GroupMessage[]) => {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, dirty: false });
      continue;
    }
    if (!existing.dirty && item.updatedAt >= existing.updatedAt) {
      map.set(item.id, { ...item, dirty: false });
      continue;
    }

    const sameMessageBody =
      existing.groupId === item.groupId &&
      existing.senderId === item.senderId &&
      existing.content === item.content &&
      existing.ciphertext === item.ciphertext &&
      existing.iv === item.iv &&
      JSON.stringify(existing.encryptedKeys ?? {}) === JSON.stringify(item.encryptedKeys ?? {}) &&
      existing.replyToMessageId === item.replyToMessageId &&
      existing.createdAt === item.createdAt;

    map.set(item.id, {
      ...existing,
      pinnedBy: existing.pinnedBy ?? item.pinnedBy,
      reactions: sameMap(item.reactions, existing.reactions)
        ? existing.reactions
        : item.updatedAt >= existing.updatedAt
          ? (item.reactions ?? existing.reactions)
          : (existing.reactions ?? item.reactions),
      recipientIds: mergeIds(existing.recipientIds, item.recipientIds),
      deliveredTo: mergeIds(existing.deliveredTo, item.deliveredTo),
      readBy: mergeIds(existing.readBy, item.readBy),
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
      dirty: sameMessageBody ? false : existing.dirty,
    });
  }
  return [...map.values()];
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(() => load());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [midnightTick, setMidnightTick] = useState(0);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});
  const [typingByGroupId, setTypingByGroupId] = useState<Record<string, string[]>>({});
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);

  useEffect(() => localStorage.setItem(LS_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    if (currentUserId) localStorage.setItem(SESSION_KEY, currentUserId);
    else localStorage.removeItem(SESSION_KEY);
  }, [currentUserId]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.settings.theme === "dark");
  }, [state.settings.theme]);

  const currentUser = useMemo(() => state.users.find((user) => user.id === currentUserId) ?? null, [state.users, currentUserId]);

  const commitOperation = useCallback(
    (operation: ReturnType<typeof queueFor>) => {
      setState((snapshot) => ({
        ...snapshot,
        syncQueue: [...snapshot.syncQueue, operation],
      }));

      void (async () => {
        if (!online) return;
        const pushed = await pushSyncOperation(operation);
        if (pushed) {
          setState((snapshot) => ({
            ...clearSyncedDirtyFlags(snapshot, [operation]),
            syncQueue: snapshot.syncQueue.filter((item) => item.id !== operation.id),
          }));
        }
      })();
    },
    [online]
  );

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void (async () => {
      const identity = await ensureEncryptionIdentity(currentUser.id);
      if (cancelled) return;
      const publicKey = publicKeyString(identity);
      if (currentUser.publicKey === publicKey) return;
      const updated = { ...currentUser, publicKey, updatedAt: Date.now() };
      setState((snapshot) => ({
        ...snapshot,
        users: snapshot.users.map((user) => user.id === currentUser.id ? updated : user),
      }));
      commitOperation(queueFor("users", "upsert", updated.id, updated));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, commitOperation]);

  useEffect(() => {
    if (!currentUser?.theme || currentUser.theme === state.settings.theme) return;
    setState((snapshot) => ({
      ...snapshot,
      settings: { ...snapshot.settings, theme: currentUser.theme ?? snapshot.settings.theme },
    }));
  }, [currentUser?.theme, state.settings.theme]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Flush sync queue when online
  useEffect(() => {
    if (!online || state.syncQueue.length === 0) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    const flush = async () => {
      const completed: string[] = [];
      for (const operation of state.syncQueue) {
        try {
          const ok = await pushSyncOperation(operation);
          if (ok) completed.push(operation.id);
        } catch {
          break;
        }
      }
      if (!cancelled && completed.length) {
        setState((snapshot) => {
          const completedSet = new Set(completed);
          const completedOperations = snapshot.syncQueue.filter((op) => completedSet.has(op.id));
          const cleanedSnapshot = clearSyncedDirtyFlags(snapshot, completedOperations);
          return {
            ...cleanedSnapshot,
            syncQueue: cleanedSnapshot.syncQueue.filter((op) => !completedSet.has(op.id)),
          };
        });
      }
      if (!cancelled && completed.length === 0 && state.syncQueue.length > 0) {
        retryTimer = window.setTimeout(flush, 2500);
      }
    };
    flush();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [online, state.syncQueue]);

  // Subscribe to Firebase realtime updates
  useEffect(() => {
    if (!hasFirebaseConfig || !currentUserId) return;
    return subscribeFirebaseState(currentUserId, (remote) => {
      setState((snapshot) => {
        let nextPosts = remote.posts ? mergePosts(snapshot.posts, remote.posts) : snapshot.posts;
        nextPosts = nextPosts.filter((p) => !p.deletedAt);

        // For connections, use Firebase as source of truth:
        // Keep local dirty items (pending sync) + all remote items.
        // This ensures deleted connections disappear for both users.
        let nextConnections: Connection[];
        if (remote.connections) {
          const remoteMap = new Map(remote.connections.map((c) => [c.id, c]));
          const dirtyLocal = snapshot.connections.filter((c) => (c as Connection & { dirty?: boolean }).dirty && !remoteMap.has(c.id));
          nextConnections = [...remote.connections, ...dirtyLocal];
        } else {
          nextConnections = snapshot.connections;
        }
        nextConnections = nextConnections.filter((c) => c.status !== "rejected");

        // Merge notifications — only keep ones for current user and less than 10 days old
        const currentRemoteUser = remote.users?.find((user) => user.id === currentUserId) ?? snapshot.users.find((user) => user.id === currentUserId);
        const notificationCutoff = Date.now() - (currentRemoteUser?.retentionDays ?? 15) * 86_400_000;
        let nextNotifications = remote.notifications
          ? remoteWithPendingLocal(snapshot.notifications, remote.notifications)
          : snapshot.notifications;
        nextNotifications = nextNotifications.filter(
          (n) => n.recipientId === currentUserId && n.createdAt > notificationCutoff
        );

        let nextGroupMessages: GroupMessage[];
        if (remote.groupMessages) {
          nextGroupMessages = mergeGroupMessages(snapshot.groupMessages, remote.groupMessages);
        } else {
          nextGroupMessages = snapshot.groupMessages;
        }

        return {
          ...snapshot,
          users: remote.users ? remoteWithPendingLocal(snapshot.users, remote.users) : snapshot.users,
          posts: nextPosts,
          connections: nextConnections,
          groups: remote.groups ? remoteWithPendingLocal(snapshot.groups, remote.groups) : snapshot.groups,
          groupMessages: nextGroupMessages,
          notifications: nextNotifications,
        };
      });
    });
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUser) return;
    const now = Date.now();
    const changedMessages: GroupMessage[] = state.groupMessages.flatMap((message) => {
      if (message.senderId === currentUser.id) return [];
      const group = state.groups.find((item) => item.id === message.groupId);
      if (!group?.memberIds.includes(currentUser.id)) return [];
      const deliveredTo = message.deliveredTo ?? [message.senderId];
      if (deliveredTo.includes(currentUser.id)) return [];
      return [{ ...message, deliveredTo: [...deliveredTo, currentUser.id], updatedAt: now, dirty: true }];
    });

    if (changedMessages.length === 0) return;
    const changedById = new Map(changedMessages.map((message) => [message.id, message]));
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((message) => changedById.get(message.id) ?? message),
    }));

    for (const message of changedMessages) {
      commitOperation(queueFor("groupMessages", "upsert", message.id, message));
    }
  }, [currentUser, state.groupMessages, state.groups, commitOperation]);

  // Request notification permission and initialize FCM push on first login
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.notificationsEnabled === false) return;
    const timer = window.setTimeout(() => {
      requestNotificationPermission().then((granted) => {
        if (granted) {
          console.log("Notification permission granted");
          void initFCMPush(currentUser.id, (title, body, data) => {
            void showLocalNotification(title, body, undefined, data);
          });
        } else {
          console.warn("Notification permission denied");
        }
      });
    }, 1500); // 1.5s delay to ensure Android WebView is fully loaded
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  // Remove local posts that don't exist in Firebase anymore (privacy enforcement)
  useEffect(() => {
    if (!online || !currentUser) return;
    const otherPosts = state.posts.filter((p) => p.userId !== currentUser.id && !p.dirty);
    if (otherPosts.length === 0) return;
    const timer = window.setTimeout(async () => {
      const ids = otherPosts.map((p) => p.id);
      const missing = await checkFirebasePostsExist(ids);
      if (missing.length > 0) {
        const missingSet = new Set(missing);
        setState((snapshot) => ({
          ...snapshot,
          posts: snapshot.posts.filter((p) => !missingSet.has(p.id)),
        }));
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [online, currentUser, state.posts]);

  /** Get accepted connection user IDs from connections collection (single source of truth) */
  const getAcceptedConnectionIds = useCallback(
    (userId: string) => deriveAcceptedIds(state.connections, userId),
    [state.connections]
  );

  const runRetentionCleanup = useCallback(() => {
    setState((snapshot) => {
      const now = Date.now();
      const expiredPostIds = new Set<string>();
      const expiredMessageIds = new Set<string>();
      const expiredNotificationIds = new Set<string>();
      for (const post of snapshot.posts) {
        const owner = snapshot.users.find((user) => user.id === post.userId);
        const retentionDays = owner?.retentionDays ?? 15;
        if (!post.deletedAt && now - post.endTime > retentionDays * 86_400_000) expiredPostIds.add(post.id);
      }
      for (const message of snapshot.groupMessages) {
        const sender = snapshot.users.find((user) => user.id === message.senderId);
        const retentionDays = sender?.retentionDays ?? 15;
        if (now - message.createdAt > retentionDays * 86_400_000) expiredMessageIds.add(message.id);
      }
      for (const notification of snapshot.notifications) {
        const recipient = snapshot.users.find((user) => user.id === notification.recipientId);
        const retentionDays = recipient?.retentionDays ?? 15;
        if (now - notification.createdAt > retentionDays * 86_400_000) expiredNotificationIds.add(notification.id);
      }
      if (!expiredPostIds.size && !expiredMessageIds.size && !expiredNotificationIds.size) {
        return { ...snapshot, settings: { ...snapshot.settings, lastRetentionRun: now } };
      }
      return {
        ...snapshot,
        posts: snapshot.posts.filter((post) => !expiredPostIds.has(post.id)),
        groupMessages: snapshot.groupMessages.filter((message) => !expiredMessageIds.has(message.id)),
        notifications: snapshot.notifications.filter((notification) => !expiredNotificationIds.has(notification.id)),
        syncQueue: [
          ...snapshot.syncQueue,
          ...[...expiredPostIds].map((id) => queueFor("posts", "delete", id)),
          ...[...expiredMessageIds].map((id) => queueFor("groupMessages", "delete", id)),
          ...[...expiredNotificationIds].map((id) => queueFor("notifications", "delete", id)),
        ],
        settings: { ...snapshot.settings, lastRetentionRun: now },
      };
    });
  }, []);

  // Scheduled retention cleanup
  useEffect(() => {
    const schedule = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      const timeout = window.setTimeout(() => {
        runRetentionCleanup();
        schedule();
      }, Math.max(1000, next.getTime() - Date.now()));
      return timeout;
    };
    const timeout = schedule();
    const interval = window.setInterval(runRetentionCleanup, 60 * 60_000);
    runRetentionCleanup();
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [runRetentionCleanup]);

  // Helper to create and push a notification to Firebase
  const createNotification = useCallback(
    (recipientId: string, type: AppNotification["type"], title: string, body: string, link?: string) => {
      if (!currentUser || recipientId === currentUser.id) return;
      const recipient = state.users.find((user) => user.id === recipientId);
      if (recipient?.notificationsEnabled === false) return;
      const now = Date.now();
      const notif: AppNotification = {
        id: uid("notif"),
        recipientId,
        type,
        title,
        body,
        link,
        read: false,
        createdAt: now,
        updatedAt: now,
      };
      setState((snapshot) => ({
        ...snapshot,
        notifications: [...snapshot.notifications, notif],
      }));
      commitOperation(queueFor("notifications", "upsert", notif.id, notif));
      
      // Trigger free FCM push notification to the recipient
      void sendFCMPush(recipientId, title, body, type, link);
    },
    [currentUser, state.users, commitOperation]
  );

  // Schedule the next midnight check for the previous day's coverage gaps.
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.notificationsEnabled === false) {
      scheduleDailyMidnightNotification(false);
      return;
    }
    const todayStart = startOfLocalDay(Date.now());
    const todayPosts = postsInLocalDay(state.posts, currentUser.id, todayStart);
    const coverage = analyzeDayCoverage(todayPosts, todayStart);
    const body = coverage.isComplete ? undefined : unloggedGapsBody(coverage.gaps);
    scheduleDailyMidnightNotification(!coverage.isComplete, body);

    // Also create one in-app/Firebase notification at midnight for yesterday's gaps.
    const scheduleMidnightCheck = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return window.setTimeout(() => {
        const dayStart = startOfLocalDay(Date.now()) - 86_400_000;
        const dayPosts = postsInLocalDay(state.posts, currentUser.id, dayStart);
        const dayCoverage = analyzeDayCoverage(dayPosts, dayStart);
        if (!dayCoverage.isComplete) {
          if (currentUser.notificationsEnabled === false) {
            setMidnightTick((value) => value + 1);
            return;
          }
          const notificationId = `unlogged_${currentUser.id}_${dateKey(dayStart)}`;
          const now = Date.now();
          const notif: AppNotification = {
            id: notificationId,
            recipientId: currentUser.id,
            type: "unlogged_gaps",
            title: "Unlogged Activity Gaps",
            body: unloggedGapsBody(dayCoverage.gaps),
            link: "/dashboard",
            read: false,
            createdAt: now,
            updatedAt: now,
          };
          setState((s) => s.notifications.some((item) => item.id === notificationId)
            ? s
            : { ...s, notifications: [...s.notifications, notif] });
          commitOperation(queueFor("notifications", "upsert", notif.id, notif));
        }
        setMidnightTick((value) => value + 1);
      }, Math.max(1000, next.getTime() - Date.now()));
    };
    const timer = scheduleMidnightCheck();
    return () => window.clearTimeout(timer);
  }, [currentUser, state.posts, commitOperation, midnightTick]);

  const register: AppContextValue["register"] = async (username, password, confirmPassword) => {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(clean)) return { ok: false, error: "Use 3-24 lowercase letters, numbers, or underscores." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (password !== confirmPassword) return { ok: false, error: "Passwords do not match." };

    // Don't check local state for username — Firebase Auth is the source of truth
    const email = usernameToEmail(clean);
    let firebaseId: string | undefined;
    try {
      if (online) {
        const account = await firebaseCreateAccount(email, password);
        firebaseId = account?.localId;
        if (account?.idToken) localStorage.setItem(TOKEN_KEY, account.idToken);
      } else {
        return { ok: false, error: "You must be online to create an account." };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Signup failed.";
      // Firebase returns "EMAIL_EXISTS" if already registered
      if (msg.includes("email-already-in-use") || msg.includes("EMAIL_EXISTS")) {
        return { ok: false, error: "Username already taken." };
      }
      return { ok: false, error: msg };
    }

    const user = makeUser(firebaseId ?? uid("u"), clean, Date.now(), password);
    const operation = queueFor("users", "upsert", user.id, user);
    setState((snapshot) => ({
      ...snapshot,
      users: [...snapshot.users, user],
    }));
    commitOperation(operation);
    setCurrentUserId(user.id);
    return { ok: true };
  };

  const login: AppContextValue["login"] = async (username, password) => {
    const clean = username.trim().toLowerCase();
    let user = state.users.find((candidate) => candidate.username === clean);

    if (online) {
      try {
        const account = await firebaseLogin(user?.email ?? usernameToEmail(clean), password);
        if (account?.idToken) localStorage.setItem(TOKEN_KEY, account.idToken);
        if (!user && account?.localId) {
          const remoteUser = await firebaseGetUser(account.localId);
          user = remoteUser
            ? { ...remoteUser, passwordHash: hashPassword(password) }
            : {
              id: account.localId,
              username: clean,
              email: usernameToEmail(clean),
              privacy: "public",
              customUsernames: [],
              retentionDays: 15,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              passwordHash: hashPassword(password),
            };
          const operation = queueFor("users", "upsert", (user as User).id, user);
          setState((snapshot) => ({
            ...snapshot,
            users: mergeByFreshness(snapshot.users, [user as User]),
          }));
          commitOperation(operation);
        } else if (user && account?.localId) {
          // Update local user with correct password hash
          const updated = { ...user, passwordHash: hashPassword(password) };
          setState((snapshot) => ({
            ...snapshot,
            users: snapshot.users.map((u) => u.id === updated.id ? updated : u),
          }));
        }
      } catch {
        if (!user || user.passwordHash !== hashPassword(password)) return { ok: false, error: "Invalid username or password." };
      }
    }

    if (!user) return { ok: false, error: "Invalid username or password." };
    if (!online && user.passwordHash !== hashPassword(password)) {
      return { ok: false, error: "Invalid username or password." };
    }

    setCurrentUserId(user.id);
    return { ok: true };
  };

  const logout = async () => {
    if (currentUser) {
      const now = Date.now();
      const updated = { ...currentUser, lastSeen: now, updatedAt: now };
      const cache = loadLastSeenCache();
      cache[currentUser.id] = now;
      saveLastSeenCache(cache);
      setState((snapshot) => ({
        ...snapshot,
        users: snapshot.users.map((user) => user.id === currentUser.id ? updated : user),
      }));
      commitOperation(queueFor("users", "upsert", updated.id, updated));
    }
    localStorage.removeItem(TOKEN_KEY);
    await firebaseSignOut().catch(() => undefined);
    setCurrentUserId(null);
  };

  const changePassword: AppContextValue["changePassword"] = (password) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (online) firebaseChangePassword(password).catch(() => toast.error("Please sign in again before changing your Firebase password."));
    const updated = { ...currentUser, passwordHash: hashPassword(password), updatedAt: Date.now() };
    const operation = queueFor("users", "upsert", updated.id, updated);
    setState((snapshot) => ({
      ...snapshot,
      users: snapshot.users.map((user) => user.id === updated.id ? updated : user),
    }));
    commitOperation(operation);
    return { ok: true };
  };

  /** Search users — exclude self and already-connected users */
  const searchUsers = useCallback((query: string) => {
    const clean = query.trim().toLowerCase();
    if (!clean || !currentUserId) return [];
    const connectedIds = new Set(deriveAcceptedIds(state.connections, currentUserId));
    return state.users
      .filter((user) => user.username.startsWith(clean) && user.id !== currentUserId && !connectedIds.has(user.id))
      .slice(0, 20);
  }, [currentUserId, state.users, state.connections]);

  /** Connection status derived from connections collection */
  const getConnectionStatus: AppContextValue["getConnectionStatus"] = (otherId) => {
    if (!currentUser) return "none";
    if (otherId === currentUser.id) return "self";
    // Check connections collection
    for (const c of state.connections) {
      const involves = (c.senderId === currentUser.id && c.receiverId === otherId) ||
        (c.senderId === otherId && c.receiverId === currentUser.id);
      if (!involves) continue;
      if (c.status === "accepted") return "connected";
      if (c.status === "pending") {
        return c.senderId === currentUser.id ? "outgoing" : "incoming";
      }
    }
    return "none";
  };

  const sendRequest: AppContextValue["sendRequest"] = (toId) => {
    if (!currentUser || toId === currentUser.id || getConnectionStatus(toId) !== "none") return;
    const connection: Connection = { id: uid("c"), senderId: currentUser.id, receiverId: toId, status: "pending", createdAt: Date.now(), updatedAt: Date.now() };
    const operation = queueFor("connections", "upsert", connection.id, connection);
    setState((snapshot) => ({
      ...snapshot,
      connections: [...snapshot.connections, connection],
    }));
    commitOperation(operation);
    // Notify the receiver
    createNotification(toId, "connection_request", "New Connection Request", `${currentUser.username} sent you a connection request.`, "/friends");
  };

  const deleteConnection: AppContextValue["deleteConnection"] = (userId) => {
    if (!currentUser) return;
    const connectionsToDelete = state.connections.filter(
      (conn) =>
        conn.status === "accepted" &&
        ((conn.senderId === currentUser.id && conn.receiverId === userId) ||
          (conn.senderId === userId && conn.receiverId === currentUser.id))
    );
    if (connectionsToDelete.length === 0) return;

    setState((snapshot) => {
      const deleteIds = new Set(connectionsToDelete.map((c) => c.id));
      return {
        ...snapshot,
        connections: snapshot.connections.filter((conn) => !deleteIds.has(conn.id)),
        syncQueue: [
          ...snapshot.syncQueue,
          ...connectionsToDelete.map((conn) => queueFor("connections", "delete", conn.id)),
        ],
      };
    });

    // Push delete operations
    for (const conn of connectionsToDelete) {
      commitOperation(queueFor("connections", "delete", conn.id));
    }
    toast.success("Connection removed.");
  };

  const respondRequest: AppContextValue["respondRequest"] = (requestId, accept) => {
    const request = state.connections.find((connection) => connection.id === requestId);
    if (!request || !currentUser) return;

    if (accept) {
      const updated = { ...request, status: "accepted" as const, updatedAt: Date.now() };
      setState((snapshot) => ({
        ...snapshot,
        connections: snapshot.connections.map((c) => c.id === requestId ? updated : c),
      }));
      commitOperation(queueFor("connections", "upsert", updated.id, updated));
      // Notify the original sender that their request was accepted
      createNotification(request.senderId, "connection_accepted", "Connection Accepted", `${currentUser.username} accepted your connection request.`, "/friends");
    } else {
      setState((snapshot) => ({
        ...snapshot,
        connections: snapshot.connections.filter((c) => c.id !== requestId),
      }));
      commitOperation(queueFor("connections", "delete", request.id));
    }
  };

  const createGroup: AppContextValue["createGroup"] = (input) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const name = input.name.trim();
    if (name.length < 2) return { ok: false, error: "Add a group name." };

    const connectedIds = new Set(deriveAcceptedIds(state.connections, currentUser.id));
    const memberIds = [...new Set([currentUser.id, ...input.memberIds.filter((id) => connectedIds.has(id))])];
    if (memberIds.length < 2) return { ok: false, error: "Select at least one connection." };

    const now = Date.now();
    const group: Group = {
      id: uid("g"),
      name,
      memberIds,
      createdBy: currentUser.id,
      createdAt: now,
      updatedAt: now,
      dirty: true,
    };
    setState((snapshot) => ({ ...snapshot, groups: [group, ...snapshot.groups] }));
    commitOperation(queueFor("groups", "upsert", group.id, group));
    return { ok: true };
  };

  const addGroupMembers: AppContextValue["addGroupMembers"] = (groupId, memberIds) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };

    const connectedIds = new Set(deriveAcceptedIds(state.connections, currentUser.id));
    const nextMemberIds = [...new Set([...group.memberIds, ...memberIds.filter((id) => connectedIds.has(id))])];
    if (nextMemberIds.length === group.memberIds.length) return { ok: false, error: "No new connections selected." };

    const updated = { ...group, memberIds: nextMemberIds, updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      groups: snapshot.groups.map((item) => item.id === groupId ? updated : item),
    }));
    commitOperation(queueFor("groups", "upsert", updated.id, updated));
    void (async () => {
      const encryption = await ensureGroupEncryption(updated);
      if (!encryption) return;
      const refreshed = {
        ...updated,
        encryptedKeys: encryption.group.encryptedKeys,
        encryptionVersion: encryption.group.encryptionVersion,
        updatedAt: Date.now(),
        dirty: true,
      };
      setState((snapshot) => ({
        ...snapshot,
        groups: snapshot.groups.map((item) => item.id === groupId ? refreshed : item),
      }));
      commitOperation(queueFor("groups", "upsert", refreshed.id, refreshed));
    })();
    return { ok: true };
  };

  const updateGroupName: AppContextValue["updateGroupName"] = (groupId, name) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = name.trim();
    if (clean.length < 2) return { ok: false, error: "Add a group name." };
    if (clean === group.name) return { ok: false, error: "Use a different group name." };

    const updated = { ...group, name: clean, updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      groups: snapshot.groups.map((item) => item.id === groupId ? updated : item),
    }));
    commitOperation(queueFor("groups", "upsert", updated.id, updated));
    return { ok: true };
  };

  const removeGroupMember: AppContextValue["removeGroupMember"] = (groupId, memberId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    if (!group.memberIds.includes(memberId)) return { ok: false, error: "User is not in this group." };

    const updated = { ...group, memberIds: group.memberIds.filter((id) => id !== memberId), updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      groups: snapshot.groups.map((item) => item.id === groupId ? updated : item),
    }));
    commitOperation(queueFor("groups", "upsert", updated.id, updated));
    return { ok: true };
  };

  const exitGroup: AppContextValue["exitGroup"] = (groupId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    return removeGroupMember(groupId, currentUser.id);
  };

  const ensureGroupEncryption = async (group: Group) => {
    if (!currentUser) return null;
    let groupKey = getCachedGroupKey(currentUser.id, group.id);
    if (!groupKey) {
      groupKey = await decryptGroupKeyForUser(currentUser.id, group.id, group.encryptedKeys?.[currentUser.id]).catch(() => null);
    }
    if (!groupKey) {
      const hasWrappedKeys = Object.keys(group.encryptedKeys ?? {}).length > 0;
      const hasExistingMessages = state.groupMessages.some((message) => message.groupId === group.id);
      if (group.encryptionVersion === 1 || hasWrappedKeys || hasExistingMessages) return null;
      groupKey = generateGroupKey();
      cacheGroupKey(currentUser.id, group.id, groupKey);
    }

    const members = group.memberIds
      .map((id) => state.users.find((user) => user.id === id))
      .filter(Boolean) as User[];
    const encryptedKeys = await encryptedKeysForMembers(members, groupKey, group.encryptedKeys);
    const keysChanged = JSON.stringify(encryptedKeys) !== JSON.stringify(group.encryptedKeys ?? {});
    if (!keysChanged && group.encryptionVersion === 1) return { groupKey, group };

    const updatedGroup: Group = {
      ...group,
      encryptedKeys,
      encryptionVersion: 1,
      updatedAt: Date.now(),
      dirty: true,
    };
    setState((snapshot) => ({
      ...snapshot,
      groups: snapshot.groups.map((item) => item.id === group.id ? updatedGroup : item),
    }));
    commitOperation(queueFor("groups", "upsert", updatedGroup.id, updatedGroup));
    return { groupKey, group: updatedGroup };
  };

  const addGroupMessage: AppContextValue["addGroupMessage"] = async (groupId, content, replyToMessageId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a message first." };
    const identity = await ensureEncryptionIdentity(currentUser.id);
    const currentPublicKey = publicKeyString(identity);
    const members = group.memberIds
      .map((id) => state.users.find((user) => user.id === id))
      .filter(Boolean)
      .map((user) => user.id === currentUser.id ? { ...user, publicKey: currentPublicKey } : user) as User[];
    const messageKey = generateGroupKey();
    const encryptedKeys = await encryptedKeysForMembers(members, messageKey);
    if (!encryptedKeys[currentUser.id]) return { ok: false, error: "Encryption is not ready." };
    const encrypted = await encryptMessageContent(messageKey, clean);
    const replyingTo = replyToMessageId
      ? state.groupMessages.find((item) => item.id === replyToMessageId && item.groupId === groupId)
      : undefined;

    const now = Date.now();
    const message: GroupMessage = {
      id: uid("gm"),
      groupId,
      senderId: currentUser.id,
      content: clean,
      encrypted: true,
      encryptionVersion: 2,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      encryptedKeys,
      recipientIds: group.memberIds,
      replyToMessageId: replyingTo?.id,
      deliveredTo: [currentUser.id],
      readBy: [currentUser.id],
      createdAt: now,
      updatedAt: now,
      dirty: true,
    };
    const updatedGroup = { ...group, updatedAt: now, dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: [...snapshot.groupMessages, message],
      groups: snapshot.groups.map((item) => item.id === groupId ? updatedGroup : item),
    }));
    setDecryptedMessages((snapshot) => ({ ...snapshot, [message.id]: clean }));
    commitOperation(queueFor("groupMessages", "upsert", message.id, message));
    commitOperation(queueFor("groups", "upsert", updatedGroup.id, updatedGroup));

    // Notify all group members except sender (skip muted users)
    for (const memberId of group.memberIds) {
      if (memberId === currentUser.id) continue;
      const member = state.users.find((u) => u.id === memberId);
      const isMuted = member?.mutedGroupIds?.includes(groupId) ?? false;
      if (!isMuted) {
        createNotification(
          memberId,
          "group_message",
          group.name,
          `${currentUser.username}: ${clean}`,
          `/groups/${groupId}`
        );
      }
    }
    return { ok: true };
  };

  const updateGroupMessage: AppContextValue["updateGroupMessage"] = async (messageId, content) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message || message.senderId !== currentUser.id) return { ok: false, error: "You can edit only your messages." };
    const group = state.groups.find((item) => item.id === message.groupId);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a message first." };
    if (clean === (decryptedMessages[message.id] ?? message.content)) return { ok: false, error: "Use different text." };
    const identity = await ensureEncryptionIdentity(currentUser.id);
    const currentPublicKey = publicKeyString(identity);
    const members = group.memberIds
      .map((id) => state.users.find((user) => user.id === id))
      .filter(Boolean)
      .map((user) => user.id === currentUser.id ? { ...user, publicKey: currentPublicKey } : user) as User[];
    const messageKey = generateGroupKey();
    const encryptedKeys = await encryptedKeysForMembers(members, messageKey);
    if (!encryptedKeys[currentUser.id]) return { ok: false, error: "Encryption is not ready." };
    const encrypted = await encryptMessageContent(messageKey, clean);

    const updated = {
      ...message,
      content: clean,
      encrypted: true,
      encryptionVersion: 2,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      encryptedKeys,
      recipientIds: group.memberIds,
      updatedAt: Date.now(),
      dirty: true,
    };
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((item) => item.id === messageId ? updated : item),
    }));
    setDecryptedMessages((snapshot) => ({ ...snapshot, [message.id]: clean }));
    commitOperation(queueFor("groupMessages", "upsert", updated.id, updated));
    return { ok: true };
  };

  const deleteGroupMessage: AppContextValue["deleteGroupMessage"] = (messageId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message) return { ok: false, error: "Message not found." };
    const group = state.groups.find((item) => item.id === message.groupId);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };

    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.filter((item) => item.id !== messageId),
    }));
    commitOperation(queueFor("groupMessages", "delete", messageId));
    return { ok: true };
  };

  const clearGroupChat: AppContextValue["clearGroupChat"] = (groupId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const messagesToDelete = state.groupMessages.filter((item) => item.groupId === groupId);
    if (messagesToDelete.length === 0) return { ok: false, error: "Chat is already empty." };

    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.filter((item) => item.groupId !== groupId),
    }));
    for (const item of messagesToDelete) {
      commitOperation(queueFor("groupMessages", "delete", item.id));
    }
    return { ok: true };
  };

  const toggleGroupMessagePin: AppContextValue["toggleGroupMessagePin"] = (messageId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message) return { ok: false, error: "Message not found." };
    const group = state.groups.find((item) => item.id === message.groupId);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };

    const pinnedBy = message.pinnedBy ?? [];
    const nextPinnedBy = pinnedBy.includes(currentUser.id)
      ? pinnedBy.filter((id) => id !== currentUser.id)
      : [...pinnedBy, currentUser.id];
    const updated = { ...message, pinnedBy: nextPinnedBy, updatedAt: Date.now(), dirty: true };

    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((item) => item.id === messageId ? updated : item),
    }));
    commitOperation(queueFor("groupMessages", "upsert", updated.id, updated));
    return { ok: true };
  };

  const toggleGroupMessageReaction: AppContextValue["toggleGroupMessageReaction"] = (messageId, reaction) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message) return { ok: false, error: "Message not found." };
    const group = state.groups.find((item) => item.id === message.groupId);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const reactions = { ...(message.reactions ?? {}) };
    const removing = reactions[currentUser.id] === reaction;
    if (removing) delete reactions[currentUser.id];
    else reactions[currentUser.id] = reaction;
    const updated = { ...message, reactions, updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((item) => item.id === messageId ? updated : item),
    }));
    commitOperation(queueFor("groupMessages", "upsert", updated.id, updated));
    if (!removing && message.senderId !== currentUser.id) {
      createNotification(
        message.senderId,
        "group_reaction",
        group.name,
        `${currentUser.username} reacted ${reaction} to your message.`,
        `/groups/${message.groupId}`
      );
    }
    return { ok: true };
  };

  const markGroupMessagesRead: AppContextValue["markGroupMessagesRead"] = (groupId) => {
    if (!currentUser) return;
    const group = state.groups.find((item) => item.id === groupId);
    if (!group?.memberIds.includes(currentUser.id)) return;

    const changedMessages: GroupMessage[] = state.groupMessages.flatMap((message) => {
      if (message.groupId !== groupId || message.senderId === currentUser.id) return [];
      const deliveredTo = message.deliveredTo ?? [message.senderId];
      const readBy = message.readBy ?? [message.senderId];
      const nextDeliveredTo = deliveredTo.includes(currentUser.id) ? deliveredTo : [...deliveredTo, currentUser.id];
      const nextReadBy = readBy.includes(currentUser.id) ? readBy : [...readBy, currentUser.id];
      if (nextDeliveredTo === deliveredTo && nextReadBy === readBy) return [];
      return [{ ...message, deliveredTo: nextDeliveredTo, readBy: nextReadBy, updatedAt: Date.now(), dirty: true }];
    });

    if (changedMessages.length === 0) return;
    const changedById = new Map(changedMessages.map((message) => [message.id, message]));
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((message) => changedById.get(message.id) ?? message),
    }));

    for (const message of changedMessages) {
      commitOperation(queueFor("groupMessages", "upsert", message.id, message));
    }
  };

  const markGroupNotificationsRead: AppContextValue["markGroupNotificationsRead"] = (groupId) => {
    if (!currentUser) return;
    const changedNotifications = state.notifications.flatMap((notification) => {
      if (
        notification.recipientId !== currentUser.id ||
        notification.type !== "group_message" ||
        notification.link !== `/groups/${groupId}` ||
        notification.read
      ) {
        return [];
      }
      return [{ ...notification, read: true, updatedAt: Date.now() }];
    });

    if (changedNotifications.length === 0) return;
    const changedById = new Map(changedNotifications.map((notification) => [notification.id, notification]));
    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.map((notification) => changedById.get(notification.id) ?? notification),
    }));

    for (const notification of changedNotifications) {
      commitOperation(queueFor("notifications", "upsert", notification.id, notification));
    }
  };

  const markNotificationsForLinkRead: AppContextValue["markNotificationsForLinkRead"] = useCallback((link) => {
    if (!currentUser) return;
    const changedNotifications = state.notifications
      .filter((notification) => notification.recipientId === currentUser.id && notification.link === link && !notification.read)
      .map((notification) => ({ ...notification, read: true, updatedAt: Date.now() }));

    if (changedNotifications.length === 0) return;
    const changedById = new Map(changedNotifications.map((notification) => [notification.id, notification]));
    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.map((notification) => changedById.get(notification.id) ?? notification),
    }));

    for (const notification of changedNotifications) {
      commitOperation(queueFor("notifications", "upsert", notification.id, notification));
    }
  }, [currentUser, state.notifications, commitOperation]);

  const toggleMuteGroup: AppContextValue["toggleMuteGroup"] = (groupId) => {
    if (!currentUser) return;
    const mutedIds = currentUser.mutedGroupIds ?? [];
    const isMuted = mutedIds.includes(groupId);
    const nextMutedIds = isMuted ? mutedIds.filter((id) => id !== groupId) : [...mutedIds, groupId];
    const updated = { ...currentUser, mutedGroupIds: nextMutedIds, updatedAt: Date.now() };
    setState((snapshot) => ({
      ...snapshot,
      users: snapshot.users.map((u) => u.id === currentUser.id ? updated : u),
    }));
    commitOperation(queueFor("users", "upsert", updated.id, updated));
  };

  const isGroupMuted: AppContextValue["isGroupMuted"] = (groupId) => {
    return currentUser?.mutedGroupIds?.includes(groupId) ?? false;
  };

  const addPost: AppContextValue["addPost"] = (input) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const maxFutureTime = Date.now() + 5 * 60_000;
    if (input.startTime > maxFutureTime || input.endTime > maxFutureTime) return { ok: false, error: "Future activity can only include the next 5 minutes." };
    if (!isValidPostRange(input.startTime, input.endTime)) return { ok: false, error: "Posts must cover at least 5 minutes." };
    if (!input.content.trim()) return { ok: false, error: "Add what happened during this time." };
    const post: Post = { id: uid("p"), userId: currentUser.id, startTime: input.startTime, endTime: input.endTime, content: input.content.trim(), visibility: input.visibility, customUsernames: input.customUsernames, createdAt: Date.now(), updatedAt: Date.now(), dirty: true };
    const operation = queueFor("posts", "upsert", post.id, post);
    setState((snapshot) => ({ ...snapshot, posts: [post, ...snapshot.posts] }));
    commitOperation(operation);
    return { ok: true };
  };

  const updatePost: AppContextValue["updatePost"] = (id, patch) => {
    const existing = state.posts.find((post) => post.id === id);
    if (!existing || existing.userId !== currentUser?.id) return { ok: false, error: "Post not found." };
    const next = { ...existing, ...patch, content: patch.content?.trim() ?? existing.content, updatedAt: Date.now(), dirty: true };
    const maxFutureTime = Date.now() + 5 * 60_000;
    if (next.startTime > maxFutureTime || next.endTime > maxFutureTime) return { ok: false, error: "Future activity can only include the next 5 minutes." };
    if (!isValidPostRange(next.startTime, next.endTime)) return { ok: false, error: "Posts must cover at least 5 minutes." };
    if (!next.content) return { ok: false, error: "Add what happened during this time." };
    const operation = queueFor("posts", "upsert", next.id, {
      startTime: next.startTime,
      endTime: next.endTime,
      content: next.content,
      visibility: next.visibility,
      customUsernames: next.customUsernames,
      updatedAt: next.updatedAt,
    });
    setState((snapshot) => ({ ...snapshot, posts: snapshot.posts.map((post) => post.id === id ? next : post) }));
    commitOperation(operation);
    return { ok: true };
  };

  const deletePost = (id: string) => {
    // Hard-remove from local state immediately, then delete from Firebase
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.filter((post) => !(post.id === id && post.userId === currentUser?.id)),
    }));
    commitOperation(queueFor("posts", "delete", id));
  };

  const togglePostLike: AppContextValue["togglePostLike"] = (postId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return { ok: false, error: "Post not found." };
    const likes = post.likes ?? [];
    const liked = likes.includes(currentUser.id);
    const updated = { ...post, likes: liked ? likes.filter((id) => id !== currentUser.id) : [...likes, currentUser.id], updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.map((item) => item.id === postId ? updated : item),
    }));
    commitOperation(queueFor("posts", "upsert", updated.id, {
      __op: "like",
      userId: currentUser.id,
      liked: !liked,
      updatedAt: updated.updatedAt,
    }));
    if (!liked && post.userId !== currentUser.id) {
      createNotification(
        post.userId,
        "post_like",
        "New like",
        `${currentUser.username} liked your post.`,
        `/dashboard?post=${post.id}`
      );
    }
    return { ok: true };
  };

  const addPostComment: AppContextValue["addPostComment"] = (postId, content) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return { ok: false, error: "Post not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a comment first." };
    const now = Date.now();
    const comment: PostComment = { id: uid("pc"), userId: currentUser.id, content: clean, createdAt: now, updatedAt: now };
    const updated = { ...post, comments: [...(post.comments ?? []), comment], updatedAt: now, dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.map((item) => item.id === postId ? updated : item),
    }));
    commitOperation(queueFor("posts", "upsert", updated.id, {
      __op: "addComment",
      comment,
      updatedAt: now,
    }));
    if (post.userId !== currentUser.id) {
      createNotification(
        post.userId,
        "post_comment",
        "New comment",
        `${currentUser.username} commented: ${clean}`,
        `/dashboard?post=${post.id}`
      );
    }
    return { ok: true };
  };

  const updatePostComment: AppContextValue["updatePostComment"] = (postId, commentId, content) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return { ok: false, error: "Post not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a comment first." };
    const comment = (post.comments ?? []).find((item) => item.id === commentId);
    if (!comment || comment.userId !== currentUser.id) return { ok: false, error: "You can edit only your comments." };
    const updated = {
      ...post,
      comments: (post.comments ?? []).map((item) => item.id === commentId ? { ...item, content: clean, updatedAt: Date.now() } : item),
      updatedAt: Date.now(),
      dirty: true,
    };
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.map((item) => item.id === postId ? updated : item),
    }));
    commitOperation(queueFor("posts", "upsert", updated.id, {
      comments: updated.comments,
      updatedAt: updated.updatedAt,
    }));
    return { ok: true };
  };

  const deletePostComment: AppContextValue["deletePostComment"] = (postId, commentId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return { ok: false, error: "Post not found." };
    const comment = (post.comments ?? []).find((item) => item.id === commentId);
    if (!comment || (comment.userId !== currentUser.id && post.userId !== currentUser.id)) return { ok: false, error: "Comment not found." };
    const updated = { ...post, comments: (post.comments ?? []).filter((item) => item.id !== commentId), updatedAt: Date.now(), dirty: true };
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.map((item) => item.id === postId ? updated : item),
    }));
    commitOperation(queueFor("posts", "upsert", updated.id, {
      comments: updated.comments,
      updatedAt: updated.updatedAt,
    }));
    return { ok: true };
  };

  const updateUserSettings: AppContextValue["updateUserSettings"] = (patch) => {
    if (!currentUser) return;
    const retentionDays = patch.retentionDays ? Math.min(60, Math.max(1, patch.retentionDays)) : currentUser.retentionDays;
    const updated = { ...currentUser, ...patch, retentionDays, updatedAt: Date.now() };
    const operation = queueFor("users", "upsert", updated.id, updated);
    setState((snapshot) => ({
      ...snapshot,
      users: snapshot.users.map((user) => user.id === currentUser.id ? updated : user),
    }));
    commitOperation(operation);
  };

  const updateTheme = (theme: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (!currentUser) return;
    const updated = { ...currentUser, theme, updatedAt: Date.now() };
    const operation = queueFor("users", "upsert", currentUser.id, updated);
    setState((snapshot) => ({
      ...snapshot,
      settings: { ...snapshot.settings, theme },
      users: snapshot.users.map((user) => user.id === currentUser.id ? updated : user),
    }));
    commitOperation(operation);
  };

  const updateTimeFormat: AppContextValue["updateTimeFormat"] = (timeFormat) => {
    setState((snapshot) => ({ ...snapshot, settings: { ...snapshot.settings, timeFormat } }));
  };

  const markNotificationsRead: AppContextValue["markNotificationsRead"] = useCallback(() => {
    if (!currentUser) return;
    const changedNotifications = state.notifications
      .filter((notification) => notification.recipientId === currentUser.id && !notification.read)
      .map((notification) => ({ ...notification, read: true, updatedAt: Date.now() }));
    if (changedNotifications.length === 0) return;

    const changedById = new Map(changedNotifications.map((notification) => [notification.id, notification]));

    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.map((notification) => changedById.get(notification.id) ?? notification),
      settings: { ...snapshot.settings, notificationLastSeen: Date.now() },
    }));
    for (const notification of changedNotifications) {
      commitOperation(queueFor("notifications", "upsert", notification.id, notification));
    }
  }, [currentUser, state.notifications, commitOperation]);

  /** Feed posts visible to current user — derived from connections collection */
  const visibleFeedPosts = useMemo(() => {
    if (!currentUser) return [];
    const connectedIds = new Set(deriveAcceptedIds(state.connections, currentUser.id));
    return state.posts
      .filter((post) => !post.deletedAt && postVisibleTo(post, state.users.find((user) => user.id === post.userId), currentUser, connectedIds))
      .sort((a, b) => b.startTime - a.startTime);
  }, [currentUser, state.posts, state.users, state.connections]);

  const visibleGroups = useMemo(() => {
    if (!currentUser) return [];
    return state.groups
      .filter((group) => group.memberIds.includes(currentUser.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [currentUser, state.groups]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void (async () => {
      for (const group of visibleGroups) {
        if (cancelled) return;
        const hasLegacyMessages = state.groupMessages.some(
          (message) => message.groupId === group.id && message.encrypted && !message.encryptedKeys
        );
        if (!hasLegacyMessages) continue;

        let groupKey = getCachedGroupKey(currentUser.id, group.id);
        if (!groupKey) {
          groupKey = await decryptGroupKeyForUser(currentUser.id, group.id, group.encryptedKeys?.[currentUser.id]).catch(() => null);
        }
        if (!groupKey) continue;

        const members = group.memberIds
          .map((id) => state.users.find((user) => user.id === id))
          .filter(Boolean) as User[];
        const encryptedKeys = await encryptedKeysForMembers(members, groupKey, group.encryptedKeys);
        if (cancelled) return;
        if (JSON.stringify(encryptedKeys) === JSON.stringify(group.encryptedKeys ?? {})) continue;

        const updatedGroup = { ...group, encryptedKeys, encryptionVersion: 1, updatedAt: Date.now(), dirty: true };
        setState((snapshot) => ({
          ...snapshot,
          groups: snapshot.groups.map((item) => item.id === group.id ? updatedGroup : item),
        }));
        commitOperation(queueFor("groups", "upsert", updatedGroup.id, updatedGroup));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, visibleGroups, state.users, state.groupMessages, commitOperation]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const message of state.groupMessages) {
        const plainFallback = message.content || "Message";
        if (!message.encrypted) {
          next[message.id] = plainFallback;
          continue;
        }
        if (!message.iv || !message.ciphertext) {
          next[message.id] = plainFallback;
          continue;
        }
        const group = state.groups.find((item) => item.id === message.groupId);
        if (!group?.memberIds.includes(currentUser.id)) continue;
        try {
          const usesLegacyGroupKey = !message.encryptedKeys?.[currentUser.id];
          const messageKey = usesLegacyGroupKey
            ? await decryptGroupKeyForUser(currentUser.id, group.id, group.encryptedKeys?.[currentUser.id])
            : await decryptWrappedKeyForUser(currentUser.id, message.encryptedKeys[currentUser.id]);
          if (!messageKey) {
            next[message.id] = plainFallback;
            continue;
          }
          try {
            next[message.id] = await decryptMessageContent(messageKey, message.iv, message.ciphertext);
          } catch (error) {
            if (!usesLegacyGroupKey || !group.encryptedKeys?.[currentUser.id]) throw error;
            clearCachedGroupKey(currentUser.id, group.id);
            const refreshedKey = await decryptGroupKeyForUser(currentUser.id, group.id, group.encryptedKeys[currentUser.id]);
            next[message.id] = refreshedKey
              ? await decryptMessageContent(refreshedKey, message.iv, message.ciphertext)
              : plainFallback;
          }
        } catch {
          next[message.id] = plainFallback;
        }
      }
      if (cancelled) return;
      setDecryptedMessages((current) => {
        let changed = false;
        const merged = { ...current };
        for (const [id, content] of Object.entries(next)) {
          if (merged[id] !== content) {
            merged[id] = content;
            changed = true;
          }
        }
        for (const id of Object.keys(merged)) {
          if (!state.groupMessages.some((message) => message.id === id)) {
            delete merged[id];
            changed = true;
          }
        }
        return changed ? merged : current;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, state.groupMessages, state.groups]);

  const presenceUserId = currentUser?.id;
  const presenceUsername = currentUser?.username;

  useEffect(() => {
    if (!presenceUserId || !presenceUsername) return;
    return connectPresence({ id: presenceUserId, username: presenceUsername } as User, [], {
      onPresence: (items) => {
        setPresenceByUserId((current) => {
          const next = { ...current };
          const lastSeenCache = loadLastSeenCache();
          let cacheChanged = false;
          for (const item of items) {
            const cachedLastSeen = item.lastSeen ?? lastSeenCache[item.userId];
            next[item.userId] = { ...item, lastSeen: cachedLastSeen };
            if (cachedLastSeen && lastSeenCache[item.userId] !== cachedLastSeen) {
              lastSeenCache[item.userId] = cachedLastSeen;
              cacheChanged = true;
            }
          }
          if (cacheChanged) saveLastSeenCache(lastSeenCache);
          return next;
        });
      },
      onTyping: (groupId, userIds) => {
        setTypingByGroupId((current) => ({ ...current, [groupId]: userIds.filter((id) => id !== presenceUserId) }));
      },
    });
  }, [presenceUserId, presenceUsername]);

  useEffect(() => {
    updatePresenceGroups(visibleGroups);
  }, [visibleGroups]);

  const groupMessagesForUi = useMemo(
    () => state.groupMessages.map((message) => message.encrypted
      ? { ...message, content: decryptedMessages[message.id] ?? message.content ?? "Message" }
      : message
    ),
    [state.groupMessages, decryptedMessages]
  );

  const myNotifications = useMemo(() => {
    if (!currentUser) return [];
    return state.notifications
      .filter((n) => n.recipientId === currentUser.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [currentUser, state.notifications]);

  const unreadNotificationCount = useMemo(() => {
    if (currentUser?.notificationsEnabled === false) return 0;
    return myNotifications.filter((n) => !n.read).length;
  }, [currentUser?.notificationsEnabled, myNotifications]);

  const pendingRequestCount = useMemo(() => {
    if (!currentUser) return 0;
    return state.connections.filter((c) => c.receiverId === currentUser.id && c.status === "pending").length;
  }, [currentUser, state.connections]);

  const unreadGroupCount = useMemo(() => {
    if (!currentUser) return 0;
    const unreadGroupIds = new Set(
      state.groupMessages
        .filter((message) => {
          if (message.senderId === currentUser.id) return false;
          if (message.groupId === activeGroupChatId) return false;
          const group = state.groups.find((item) => item.id === message.groupId);
          if (!group?.memberIds.includes(currentUser.id)) return false;
          return !(message.readBy ?? [message.senderId]).includes(currentUser.id);
        })
        .map((message) => message.groupId)
    );
    return unreadGroupIds.size;
  }, [currentUser, state.groupMessages, state.groups, activeGroupChatId]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    posts: state.posts,
    connections: state.connections,
    groups: state.groups,
    groupMessages: groupMessagesForUi,
    notifications: myNotifications,
    settings: state.settings,
    syncPendingCount: state.syncQueue.length,
    online,
    register,
    login,
    logout,
    changePassword,
    searchUsers,
    sendRequest,
    respondRequest,
    deleteConnection,
    getAcceptedConnectionIds,
    getConnectionStatus,
    createGroup,
    updateGroupName,
    addGroupMembers,
    removeGroupMember,
    exitGroup,
    addGroupMessage,
    updateGroupMessage,
    deleteGroupMessage,
    clearGroupChat,
    toggleGroupMessagePin,
    toggleGroupMessageReaction,
    markGroupMessagesRead,
    markGroupNotificationsRead,
    markNotificationsForLinkRead,
    setActiveGroupChat: setActiveGroupChatId,
    toggleMuteGroup,
    isGroupMuted,
    addPost,
    updatePost,
    deletePost,
    togglePostLike,
    addPostComment,
    updatePostComment,
    deletePostComment,
    updateUserSettings,
    updateTheme,
    updateTimeFormat,
    runRetentionCleanup,
    markNotificationsRead,
    unreadNotificationCount,
    pendingRequestCount,
    unreadGroupCount,
    presenceByUserId,
    typingByGroupId,
    emitTyping: emitSocketTyping,
    visibleFeedPosts,
    visibleGroups,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
