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
} from "@/lib/firebaseSync";
import { analyzeDayCoverage, dateKey, isValidPostRange, postsInLocalDay, startOfLocalDay, unloggedGapsBody } from "@/lib/timeCoverage";
import { requestNotificationPermission, scheduleDailyMidnightNotification, showLocalNotification } from "@/lib/notifications";
import { initFCMPush, sendFCMPush } from "@/lib/pushNotifications";
import { decryptGroupMessageFromStorage, encryptGroupMessageForStorage } from "@/lib/groupMessageCrypto";

import { connectPresence, emitTyping as emitSocketTyping, updatePresenceGroups, type PresenceStatus } from "@/lib/presence";

const LS_KEY = "taskmates_activity_state_v1";
const SESSION_KEY = "taskmates_activity_session_v1";
const TOKEN_KEY = "taskmates_firebase_token_v1";
const LAST_SEEN_KEY = "taskmates_last_seen_cache_v1";
const DEFAULT_THEME: "light" | "dark" = "dark";
const DEFAULT_RETENTION_DAYS = 5;
const RETENTION_DEFAULT_MIGRATION_KEY = "taskmates_retention_default_migrated_v1";
export const PUBLIC_CHAT_ID = "taskmates_public_chat";
const PUBLIC_CHAT_UNMUTED_ID = `${PUBLIC_CHAT_ID}:unmuted`;

export interface AppContextValue {
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
  groupsLoading: boolean;
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
  deleteGroupMessage: (messageId: string, scope?: "me" | "everyone") => AuthResult;
  clearGroupChat: (groupId: string) => AuthResult;
  toggleGroupMessagePin: (messageId: string) => AuthResult;
  toggleGroupMessageReaction: (messageId: string, reaction: string) => AuthResult;
  markGroupMessagesRead: (groupId: string) => void;
  markGroupNotificationsRead: (groupId: string) => void;
  markNotificationsForLinkRead: (link: string) => void;
  deleteNotification: (notificationId: string) => void;
  setActiveGroupChat: (groupId: string | null) => void;
  toggleMuteGroup: (groupId: string) => void;
  isGroupMuted: (groupId: string) => boolean;
  addPost: (input: { startTime: number; endTime: number; content: string; visibility?: Visibility; customUsernames?: string[] }) => AuthResult;
  updatePost: (id: string, patch: Partial<Pick<Post, "startTime" | "endTime" | "content" | "visibility" | "customUsernames">>) => AuthResult;
  deletePost: (id: string) => void;
  togglePostLike: (postId: string) => AuthResult;
  addPostComment: (postId: string, content: string, parentCommentId?: string) => AuthResult;
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
  retentionDays: DEFAULT_RETENTION_DAYS,
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

const makePublicChatGroup = (users: User[], now = Date.now()): Group => ({
  id: PUBLIC_CHAT_ID,
  name: "Announcements",
  memberIds: [...new Set(users.map((user) => user.id))],
  createdBy: "system",
  createdAt: 0,
  updatedAt: now,
});

const resolveGroup = (groups: Group[], users: User[], groupId: string, messages: GroupMessage[] = []) => {
  if (groupId !== PUBLIC_CHAT_ID) return groups.find((item) => item.id === groupId);
  const lastMessageAt = Math.max(0, ...messages.filter((item) => item.groupId === PUBLIC_CHAT_ID).map((item) => item.createdAt));
  return makePublicChatGroup(users, lastMessageAt || Date.now());
};

const sameMap = (a?: Record<string, string>, b?: Record<string, string>) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

const mergePosts = (local: Post[], remote: Post[]) => {
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));
  const pendingLocal = local.filter((item) => item.dirty && !remoteIds.has(item.id));
  const map = new Map(pendingLocal.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = localMap.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, content: item.content ?? "", dirty: false });
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
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));
  const pendingLocal = local.filter((item) => item.dirty && !remoteIds.has(item.id));
  const map = new Map(pendingLocal.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = localMap.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, dirty: false });
      continue;
    }
    if (!existing.dirty && item.updatedAt >= existing.updatedAt) {
      const sameEncryptedPayload = item.ciphertext === existing.ciphertext && item.iv === existing.iv;
      map.set(item.id, {
        ...item,
        // Keep locally decrypted text for encrypted messages so we don't re-decrypt on every snapshot.
        content: item.content ?? (sameEncryptedPayload ? existing.content : ""),
        dirty: false,
      });
      continue;
    }

    const sameMessageBody =
      existing.groupId === item.groupId &&
      existing.senderId === item.senderId &&
      existing.ciphertext === item.ciphertext &&
      existing.iv === item.iv &&
      JSON.stringify(existing.encryptedKeys ?? {}) === JSON.stringify(item.encryptedKeys ?? {}) &&
      existing.replyToMessageId === item.replyToMessageId &&
      existing.editedAt === item.editedAt &&
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
      deletedFor: mergeIds(existing.deletedFor, item.deletedFor),
      editedAt: Math.max(existing.editedAt ?? 0, item.editedAt ?? 0) || undefined,
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
  const [appActive, setAppActive] = useState(() => document.visibilityState === "visible");
  const [groupsLoading, setGroupsLoading] = useState(false);
  const groupsLoadedOnceRef = useRef(false);

  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});
  const [typingByGroupId, setTypingByGroupId] = useState<Record<string, string[]>>({});
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const deliveryProcessedRef = useRef<Set<string>>(new Set());
  const decryptingMessageIdsRef = useRef<Set<string>>(new Set());
  const decryptedMessageVersionRef = useRef<Map<string, number>>(new Map());
  const pushInitUserIdRef = useRef<string | null>(null);
  const lsSaveTimerRef = useRef<number | undefined>(undefined);
  const midnightScheduleKeyRef = useRef("");
  const stateRef = useRef(state);
  const appActiveRef = useRef(appActive);
  stateRef.current = state;
  appActiveRef.current = appActive;

  // Debounced localStorage save — avoids blocking the main thread on every state update
  useEffect(() => {
    if (lsSaveTimerRef.current) window.clearTimeout(lsSaveTimerRef.current);
    lsSaveTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    }, 500);
    return () => { if (lsSaveTimerRef.current) window.clearTimeout(lsSaveTimerRef.current); };
  }, [state]);
  // Save immediately on unmount / page hide
  useEffect(() => {
    const saveNow = () => localStorage.setItem(LS_KEY, JSON.stringify(stateRef.current));
    const onVisChange = () => { if (document.visibilityState === "hidden") saveNow(); };
    window.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pagehide", saveNow);
      saveNow();
    };
  }, []);
  useEffect(() => {
    if (currentUserId) localStorage.setItem(SESSION_KEY, currentUserId);
    else localStorage.removeItem(SESSION_KEY);
  }, [currentUserId]);
  useEffect(() => {
    const cache = loadLastSeenCache();
    let changed = false;
    for (const user of state.users) {
      if (user.lastSeen && cache[user.id] !== user.lastSeen) {
        cache[user.id] = user.lastSeen;
        changed = true;
      }
    }
    if (changed) saveLastSeenCache(cache);
  }, [state.users]);
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
    if (!currentUser || currentUser.retentionDays !== 15) return;
    const migrationKey = `${RETENTION_DEFAULT_MIGRATION_KEY}:${currentUser.id}`;
    if (localStorage.getItem(migrationKey)) return;
    localStorage.setItem(migrationKey, "1");
    const updated = { ...currentUser, retentionDays: DEFAULT_RETENTION_DAYS, updatedAt: Date.now() };
    setState((snapshot) => ({
      ...snapshot,
      users: snapshot.users.map((user) => user.id === updated.id ? updated : user),
    }));
    commitOperation(queueFor("users", "upsert", updated.id, updated));
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

  useEffect(() => {
    const onVisibilityChange = () => setAppActive(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);

    let removeAppState: (() => void) | undefined;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", ({ isActive }) => setAppActive(isActive)).then((handle) => {
        removeAppState = () => handle.remove();
      });
    }).catch(() => undefined);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      removeAppState?.();
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !appActive) return;
    let lastSavedAt = 0;
    const saveLastSeen = () => {
      const now = Date.now();
      if (now - lastSavedAt < 60_000) return;
      lastSavedAt = now;
      const updated = { ...currentUser, lastSeen: now, updatedAt: now };
      const cache = loadLastSeenCache();
      cache[currentUser.id] = now;
      saveLastSeenCache(cache);
      setState((snapshot) => ({
        ...snapshot,
        users: snapshot.users.map((user) => user.id === currentUser.id ? updated : user),
      }));
      commitOperation(queueFor("users", "upsert", updated.id, updated));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveLastSeen();
    };
    const onOffline = () => saveLastSeen();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", saveLastSeen);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", saveLastSeen);
      window.removeEventListener("offline", onOffline);
    };
  }, [currentUser, appActive, commitOperation]);

  // Flush sync queue when online
  useEffect(() => {
    if (!online || !appActive || state.syncQueue.length === 0) return;
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
  }, [online, appActive, state.syncQueue]);

  // Subscribe to Firebase realtime updates
  useEffect(() => {
    if (!hasFirebaseConfig || !currentUserId || !appActive) {
      setGroupsLoading(false);
      return;
    }
    // Only show loading spinner on the initial groups fetch, not every time
    // appActive toggles (e.g. tab switch or screen wake).
    if (!groupsLoadedOnceRef.current) {
      setGroupsLoading(true);
    }
    // Safety timeout: if groups snapshot never fires, stop loading after 10s.
    const safetyTimer = window.setTimeout(() => {
      setGroupsLoading(false);
    }, 10_000);
    const unsubscribe = subscribeFirebaseState(currentUserId, (remote) => {
      if (remote.groups) {
        groupsLoadedOnceRef.current = true;
        setGroupsLoading(false);
        window.clearTimeout(safetyTimer);
      }
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
        const notificationCutoff = Date.now() - (currentRemoteUser?.retentionDays ?? DEFAULT_RETENTION_DAYS) * 86_400_000;
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
    return () => {
      window.clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [currentUserId, appActive]);

  // Decrypt encrypted group messages once per version and cache plaintext in local state.
  useEffect(() => {
    const targets = state.groupMessages.filter((message) => {
      if (!message.encrypted || !message.ciphertext || !message.iv) return false;
      if (message.content) return false;
      if (decryptingMessageIdsRef.current.has(message.id)) return false;
      return decryptedMessageVersionRef.current.get(message.id) !== message.updatedAt;
    });
    if (targets.length === 0) return;

    let cancelled = false;
    targets.forEach((message) => decryptingMessageIdsRef.current.add(message.id));

    void Promise.all(
      targets.map(async (message) => {
        try {
          const content = await decryptGroupMessageFromStorage(message.ciphertext!, message.iv!);
          return { id: message.id, content, updatedAt: message.updatedAt };
        } catch {
          return null;
        } finally {
          decryptingMessageIdsRef.current.delete(message.id);
        }
      })
    ).then((resolved) => {
      if (cancelled) return;
      const items = resolved.filter((item): item is { id: string; content: string; updatedAt: number } => Boolean(item));
      if (items.length === 0) return;

      const byId = new Map(items.map((item) => [item.id, item]));
      items.forEach((item) => decryptedMessageVersionRef.current.set(item.id, item.updatedAt));
      setState((snapshot) => ({
        ...snapshot,
        groupMessages: snapshot.groupMessages.map((message) => {
          const next = byId.get(message.id);
          if (!next) return message;
          if (message.updatedAt !== next.updatedAt || message.content) return message;
          return { ...message, content: next.content };
        }),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [state.groupMessages]);

  // Mark messages as delivered (2 ticks) — runs when messages arrive from Firebase.
  // Uses atomic arrayUnion writes to prevent concurrent delivery marking race conditions.
  // Uses a ref to track already-processed message IDs and prevent cascading re-renders.
  useEffect(() => {
    if (!currentUser || !appActive) return;
    const now = Date.now();
    const toDeliver: string[] = [];
    for (const message of state.groupMessages) {
      if (message.senderId === currentUser.id) continue;
      if (deliveryProcessedRef.current.has(message.id)) continue;
      const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
      if (!group?.memberIds.includes(currentUser.id)) continue;
      const deliveredTo = message.deliveredTo ?? [message.senderId];
      if (deliveredTo.includes(currentUser.id)) {
        deliveryProcessedRef.current.add(message.id);
        continue;
      }
      deliveryProcessedRef.current.add(message.id);
      toDeliver.push(message.id);
    }

    if (toDeliver.length === 0) return;
    // Update local state immediately so ticks show
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((message) =>
        toDeliver.includes(message.id)
          ? { ...message, deliveredTo: [...(message.deliveredTo ?? [message.senderId]), currentUser.id], updatedAt: now }
          : message
      ),
    }));

    // Use atomic arrayUnion writes — no race conditions with concurrent deliveries
    for (const messageId of toDeliver) {
      commitOperation(queueFor("groupMessages", "upsert", messageId, {
        __op: "markDelivered",
        userId: currentUser.id,
        updatedAt: now,
      }));
    }
  }, [currentUser, appActive, state.groupMessages, state.groups, commitOperation]);

  // Request notification permission on first login
  useEffect(() => {
    if (!currentUser?.id || !appActive) return;
    if (currentUser.notificationsEnabled === false) {
      pushInitUserIdRef.current = null;
      return;
    }
    if (pushInitUserIdRef.current === currentUser.id) return;
    const timer = window.setTimeout(() => {
      requestNotificationPermission().then((granted) => {
        if (granted) {
          pushInitUserIdRef.current = currentUser.id;
          console.log("Notification permission granted");
          void initFCMPush(currentUser.id, (title, body, data) => {
            if (!appActiveRef.current) return;
            void showLocalNotification(title, body, undefined, data);
          });
        } else {
          console.warn("Notification permission denied");
        }
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id, currentUser?.notificationsEnabled, appActive]);

  /** Get accepted connection user IDs from connections collection (single source of truth) */
  const getAcceptedConnectionIds = useCallback(
    (userId: string) => deriveAcceptedIds(state.connections, userId),
    [state.connections]
  );

  const runRetentionCleanup = useCallback(() => {
    const snapshot = stateRef.current;
    const now = Date.now();
    const expiredPostIds = new Set<string>();
    const expiredMessageIds = new Set<string>();
    const expiredNotificationIds = new Set<string>();

    for (const post of snapshot.posts) {
      const owner = snapshot.users.find((user) => user.id === post.userId);
      const retentionDays = owner?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      if (!post.deletedAt && now - post.endTime > retentionDays * 86_400_000) expiredPostIds.add(post.id);
    }
    for (const message of snapshot.groupMessages) {
      const sender = snapshot.users.find((user) => user.id === message.senderId);
      const retentionDays = sender?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      if (now - message.createdAt > retentionDays * 86_400_000) expiredMessageIds.add(message.id);
    }
    for (const notification of snapshot.notifications) {
      const recipient = snapshot.users.find((user) => user.id === notification.recipientId);
      const retentionDays = recipient?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      if (now - notification.createdAt > retentionDays * 86_400_000) expiredNotificationIds.add(notification.id);
    }

    if (!expiredPostIds.size && !expiredMessageIds.size && !expiredNotificationIds.size) {
      setState((current) => ({ ...current, settings: { ...current.settings, lastRetentionRun: now } }));
      return;
    }

    const operations: ReturnType<typeof queueFor>[] = [];
    operations.push(
      ...[...expiredPostIds].map((id) => queueFor("posts", "delete", id)),
      ...[...expiredMessageIds].map((id) => queueFor("groupMessages", "delete", id)),
      ...[...expiredNotificationIds].map((id) => queueFor("notifications", "delete", id))
    );
    setState((current) => {
      return {
        ...current,
        posts: current.posts.filter((post) => !expiredPostIds.has(post.id)),
        groupMessages: current.groupMessages.filter((message) => !expiredMessageIds.has(message.id)),
        notifications: current.notifications.filter((notification) => !expiredNotificationIds.has(notification.id)),
        settings: { ...current.settings, lastRetentionRun: now },
      };
    });
    operations.forEach(commitOperation);
  }, [commitOperation]);

  // Scheduled retention cleanup
  useEffect(() => {
    if (!appActive) return;
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
  }, [runRetentionCleanup, appActive]);

  // Helper to create and push a notification to Firebase
  const createNotification = useCallback(
    async (
      recipientId: string,
      type: AppNotification["type"],
      title: string,
      body: string,
      link?: string,
      pushData?: Record<string, string>,
      skipPush = false,
      skipFirebase = false
    ) => {
      if (!appActiveRef.current) return false;
      if (!currentUser || recipientId === currentUser.id) return false;
      const recipient = stateRef.current.users.find((user) => user.id === recipientId);
      if (recipient?.notificationsEnabled === false) return false;
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
      if (!skipFirebase) {
        setState((snapshot) => ({
          ...snapshot,
          notifications: [...snapshot.notifications, notif],
        }));
        commitOperation(queueFor("notifications", "upsert", notif.id, notif));
      }

      // Trigger free FCM push notification to the recipient
      if (skipPush) return true;
      return sendFCMPush(recipientId, title, body, type, link, pushData);
    },
    [currentUser, commitOperation]
  );

  const createGapNotificationForDay = useCallback((userId: string, dayStart: number) => {
    const snap = stateRef.current;
    const dayPosts = postsInLocalDay(snap.posts, userId, dayStart);
    const dayCoverage = analyzeDayCoverage(dayPosts, dayStart);
    if (dayCoverage.isComplete) return;
    const notificationId = `unlogged_${userId}_${dateKey(dayStart)}`;
    if (snap.notifications.some((item) => item.id === notificationId)) return;
    const now = Date.now();
    const notif: AppNotification = {
      id: notificationId,
      recipientId: userId,
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
  }, [commitOperation]);

  // Keep only today's scheduled local midnight reminder in sync with today's coverage.
  useEffect(() => {
    if (!currentUser) return;
    if (!appActive || currentUser.notificationsEnabled === false) {
      midnightScheduleKeyRef.current = "";
      scheduleDailyMidnightNotification(false);
      return;
    }
    const todayStart = startOfLocalDay(Date.now());
    const todayPosts = postsInLocalDay(state.posts, currentUser.id, todayStart);
    const coverage = analyzeDayCoverage(todayPosts, todayStart);
    const body = coverage.isComplete ? undefined : unloggedGapsBody(coverage.gaps);
    const scheduleKey = `${currentUser.id}:${dateKey(todayStart)}:${coverage.isComplete}:${body ?? ""}`;
    if (scheduleKey === midnightScheduleKeyRef.current) return;
    midnightScheduleKeyRef.current = scheduleKey;
    scheduleDailyMidnightNotification(!coverage.isComplete, body);
  }, [currentUser, appActive, state.posts]);

  // Create one in-app/Firebase notification strictly at midnight for the previous day.
  useEffect(() => {
    if (!currentUser || !appActive) return;
    if (currentUser.notificationsEnabled === false) return;
    let timer: number | undefined;
    const scheduleMidnightCheck = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      timer = window.setTimeout(() => {
        const dayStart = startOfLocalDay(Date.now()) - 86_400_000;
        createGapNotificationForDay(currentUser.id, dayStart);
        scheduleMidnightCheck();
      }, Math.max(1000, next.getTime() - Date.now()));
    };
    scheduleMidnightCheck();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [currentUser, appActive, createGapNotificationForDay]);

  const register: AppContextValue["register"] = async (username, password, confirmPassword) => {
    const clean = username.trim().toLowerCase();
    if (username !== username.trim() || /\s/.test(username)) return { ok: false, error: "Username cannot contain spaces." };
    if (clean.length < 3 || clean.length > 24) return { ok: false, error: "Username must be 3-24 characters." };
    if (clean !== username) return { ok: false, error: "Username must use lowercase letters." };
    if (!/^[a-z0-9_]+$/.test(clean)) return { ok: false, error: "Username can only use lowercase letters, numbers, and underscores." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (/\s/.test(password)) return { ok: false, error: "Password cannot contain spaces." };
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
              retentionDays: DEFAULT_RETENTION_DAYS,
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
    groupsLoadedOnceRef.current = false;
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

    const deleteIds = new Set(connectionsToDelete.map((c) => c.id));
    setState((snapshot) => ({
      ...snapshot,
      connections: snapshot.connections.filter((conn) => !deleteIds.has(conn.id)),
    }));

    // Push delete operations (only via commitOperation, not double-pushed via syncQueue)
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


  const addGroupMessage: AppContextValue["addGroupMessage"] = async (groupId, content, replyToMessageId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = resolveGroup(state.groups, state.users, groupId, state.groupMessages);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a message first." };
    const replyingTo = replyToMessageId
      ? state.groupMessages.find((item) => item.id === replyToMessageId && item.groupId === groupId)
      : undefined;

    const now = Date.now();
    const encryptedPayload = await encryptGroupMessageForStorage(clean);
    const message: GroupMessage = {
      id: uid("gm"),
      groupId,
      senderId: currentUser.id,
      content: clean,
      encrypted: true,
      encryptionVersion: 1,
      ciphertext: encryptedPayload.ciphertext,
      iv: encryptedPayload.iv,
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
      groups: groupId === PUBLIC_CHAT_ID ? snapshot.groups : snapshot.groups.map((item) => item.id === groupId ? updatedGroup : item),
    }));
    commitOperation(queueFor("groupMessages", "upsert", message.id, { ...message, content: undefined }));
    if (groupId !== PUBLIC_CHAT_ID) commitOperation(queueFor("groups", "upsert", updatedGroup.id, updatedGroup));

    // Notify all group members except sender (skip muted users)
    const pushBody = clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
    await Promise.all(
      group.memberIds.map(async (memberId) => {
        if (memberId === currentUser.id) return;
        const member = state.users.find((u) => u.id === memberId);
        const mutedIds = member?.mutedGroupIds ?? [];
        const isMuted = groupId === PUBLIC_CHAT_ID ? !mutedIds.includes(PUBLIC_CHAT_UNMUTED_ID) : mutedIds.includes(groupId);
        if (isMuted) return;
        await createNotification(
          memberId,
          "group_message",
          group.name,
          `${currentUser.username}: ${pushBody}`,
          `/groups/${groupId}`,
          { messageId: message.id, groupId },
          false,
          true
        );
      })
    );
    return { ok: true };
  };

  const updateGroupMessage: AppContextValue["updateGroupMessage"] = async (messageId, content) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message || message.senderId !== currentUser.id) return { ok: false, error: "You can edit only your messages." };
    const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a message first." };
    if (clean === message.content) return { ok: false, error: "Use different text." };
    const encryptedPayload = await encryptGroupMessageForStorage(clean);

    const updated = {
      ...message,
      content: clean,
      encrypted: true,
      encryptionVersion: 1,
      ciphertext: encryptedPayload.ciphertext,
      iv: encryptedPayload.iv,
      recipientIds: group.memberIds,
      editedAt: Date.now(),
      updatedAt: Date.now(),
      dirty: true,
    };
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((item) => item.id === messageId ? updated : item),
    }));
    commitOperation(queueFor("groupMessages", "upsert", updated.id, { ...updated, content: undefined }));
    return { ok: true };
  };

  const deleteGroupMessage: AppContextValue["deleteGroupMessage"] = (messageId, scope = "everyone") => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message) return { ok: false, error: "Message not found." };
    const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const deleteForEveryone = scope === "everyone" && message.senderId === currentUser.id;
    const now = Date.now();

    setState((snapshot) => ({
      ...snapshot,
      groupMessages: deleteForEveryone
        ? snapshot.groupMessages.filter((item) => item.id !== messageId)
        : snapshot.groupMessages.map((item) =>
          item.id === messageId
            ? { ...item, deletedFor: mergeIds(item.deletedFor, [currentUser.id]), updatedAt: now, dirty: true }
            : item
        ),
    }));
    if (deleteForEveryone) {
      commitOperation(queueFor("groupMessages", "delete", messageId));
    } else {
      commitOperation(queueFor("groupMessages", "upsert", messageId, {
        __op: "deleteForMe",
        userId: currentUser.id,
        updatedAt: now,
      }));
    }
    return { ok: true };
  };

  const clearGroupChat: AppContextValue["clearGroupChat"] = (groupId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = resolveGroup(state.groups, state.users, groupId, state.groupMessages);
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
    const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
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
    const cleanReaction = reaction.trim();
    if (!/\p{Extended_Pictographic}/u.test(cleanReaction) || /[\p{L}\p{N}]/u.test(cleanReaction)) {
      return { ok: false, error: "Choose an emoji reaction." };
    }
    const message = state.groupMessages.find((item) => item.id === messageId);
    if (!message) return { ok: false, error: "Message not found." };
    const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
    if (!group?.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const reactions = { ...(message.reactions ?? {}) };
    const removing = reactions[currentUser.id] === cleanReaction;
    if (removing) delete reactions[currentUser.id];
    else reactions[currentUser.id] = cleanReaction;
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
        `${currentUser.username} reacted ${cleanReaction} to your message.`,
        `/groups/${message.groupId}`,
        undefined,
        false,
        true
      );
    }
    return { ok: true };
  };

  const markGroupMessagesRead: AppContextValue["markGroupMessagesRead"] = useCallback((groupId) => {
    const snap = stateRef.current;
    const user = snap.users.find((u) => u.id === currentUserId);
    if (!user) return;
    const group = resolveGroup(snap.groups, snap.users, groupId, snap.groupMessages);
    if (!group?.memberIds.includes(user.id)) return;

    const now = Date.now();
    const toMark: string[] = [];
    for (const message of snap.groupMessages) {
      if (message.groupId !== groupId || message.senderId === user.id) continue;
      const deliveredTo = message.deliveredTo ?? [message.senderId];
      const readBy = message.readBy ?? [message.senderId];
      const alreadyDelivered = deliveredTo.includes(user.id);
      const alreadyRead = readBy.includes(user.id);
      if (alreadyDelivered && alreadyRead) continue;
      toMark.push(message.id);
    }

    if (toMark.length === 0) return;
    // Update local state immediately
    setState((snapshot) => ({
      ...snapshot,
      groupMessages: snapshot.groupMessages.map((message) => {
        if (!toMark.includes(message.id)) return message;
        return {
          ...message,
          deliveredTo: (message.deliveredTo ?? [message.senderId]).includes(user.id)
            ? message.deliveredTo
            : [...(message.deliveredTo ?? [message.senderId]), user.id],
          readBy: (message.readBy ?? [message.senderId]).includes(user.id)
            ? message.readBy
            : [...(message.readBy ?? [message.senderId]), user.id],
          updatedAt: now,
        };
      }),
    }));

    // Use atomic arrayUnion writes for each message
    for (const messageId of toMark) {
      deliveryProcessedRef.current.add(messageId);
      commitOperation(queueFor("groupMessages", "upsert", messageId, {
        __op: "markRead",
        userId: user.id,
        updatedAt: now,
      }));
    }
  }, [currentUserId, commitOperation]);

  const markGroupNotificationsRead: AppContextValue["markGroupNotificationsRead"] = useCallback((groupId) => {
    const snap = stateRef.current;
    const user = snap.users.find((u) => u.id === currentUserId);
    if (!user) return;
    const notificationsToDelete = snap.notifications.filter(
      (notification) =>
        notification.recipientId === user.id &&
        (notification.type === "group_message" || notification.type === "group_reaction") &&
        notification.link === `/groups/${groupId}`
    );

    if (notificationsToDelete.length === 0) return;
    const deleteIds = new Set(notificationsToDelete.map((notification) => notification.id));
    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.filter((notification) => !deleteIds.has(notification.id)),
    }));

    for (const notification of notificationsToDelete) {
      commitOperation(queueFor("notifications", "delete", notification.id));
    }
  }, [currentUserId, commitOperation]);

  const markNotificationsForLinkRead: AppContextValue["markNotificationsForLinkRead"] = useCallback((link) => {
    const snap = stateRef.current;
    const user = snap.users.find((item) => item.id === currentUserId);
    if (!user) return;
    const changedNotifications = snap.notifications
      .filter((notification) => notification.recipientId === user.id && notification.link === link && !notification.read)
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
  }, [currentUserId, commitOperation]);

  const deleteNotification: AppContextValue["deleteNotification"] = useCallback((notificationId) => {
    const snap = stateRef.current;
    const notification = snap.notifications.find((item) => item.id === notificationId && item.recipientId === currentUserId);
    if (!notification) return;
    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.filter((item) => item.id !== notificationId),
    }));
    commitOperation(queueFor("notifications", "delete", notificationId));
  }, [currentUserId, commitOperation]);

  const toggleMuteGroup: AppContextValue["toggleMuteGroup"] = (groupId) => {
    if (!currentUser) return;
    const mutedIds = currentUser.mutedGroupIds ?? [];
    const isPublicChat = groupId === PUBLIC_CHAT_ID;
    const isMuted = isPublicChat ? !mutedIds.includes(PUBLIC_CHAT_UNMUTED_ID) : mutedIds.includes(groupId);
    const nextMutedIds = isPublicChat
      ? (isMuted ? [...mutedIds, PUBLIC_CHAT_UNMUTED_ID] : mutedIds.filter((id) => id !== PUBLIC_CHAT_UNMUTED_ID))
      : (isMuted ? mutedIds.filter((id) => id !== groupId) : [...mutedIds, groupId]);
    const updated = { ...currentUser, mutedGroupIds: nextMutedIds, updatedAt: Date.now() };
    setState((snapshot) => ({
      ...snapshot,
      users: snapshot.users.map((u) => u.id === currentUser.id ? updated : u),
    }));
    commitOperation(queueFor("users", "upsert", updated.id, updated));
  };

  const isGroupMuted: AppContextValue["isGroupMuted"] = (groupId) => {
    if (groupId === PUBLIC_CHAT_ID) return !(currentUser?.mutedGroupIds ?? []).includes(PUBLIC_CHAT_UNMUTED_ID);
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

  const addPostComment: AppContextValue["addPostComment"] = (postId, content, parentCommentId) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return { ok: false, error: "Post not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a comment first." };
    const parent = parentCommentId ? (post.comments ?? []).find((item) => item.id === parentCommentId) : undefined;
    if (parentCommentId && !parent) return { ok: false, error: "Comment not found." };
    const now = Date.now();
    const comment: PostComment = { id: uid("pc"), userId: currentUser.id, content: clean, parentCommentId: parent?.parentCommentId ?? parent?.id, createdAt: now, updatedAt: now };
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
    const snap = stateRef.current;
    const user = snap.users.find((item) => item.id === currentUserId);
    if (!user) return;
    const changedNotifications = snap.notifications
      .filter((notification) => notification.recipientId === user.id && !notification.read)
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
  }, [currentUserId, commitOperation]);

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
    const publicChat = makePublicChatGroup(
      state.users,
      Math.max(0, ...state.groupMessages.filter((item) => item.groupId === PUBLIC_CHAT_ID).map((item) => item.createdAt))
    );
    return [publicChat, ...state.groups]
      .filter((group) => group.memberIds.includes(currentUser.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [currentUser, state.groups, state.groupMessages, state.users]);

  const presenceUserId = currentUser?.id;
  const presenceUsername = currentUser?.username;

  useEffect(() => {
    if (!presenceUserId || !presenceUsername || !appActive) return;
    return connectPresence({ id: presenceUserId, username: presenceUsername } as User, visibleGroups, {
      onPresence: (items) => {
        setPresenceByUserId((current) => {
          const next = { ...current };
          const lastSeenCache = loadLastSeenCache();
          let cacheChanged = false;
          for (const item of items) {
            const userLastSeen = stateRef.current.users.find((user) => user.id === item.userId)?.lastSeen;
            const cachedLastSeen = item.lastSeen ?? lastSeenCache[item.userId] ?? userLastSeen;
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
  }, [presenceUserId, presenceUsername, visibleGroups, appActive]);

  useEffect(() => {
    if (!appActive) return;
    updatePresenceGroups(visibleGroups);
  }, [visibleGroups, appActive]);

  const groupMessagesForUi = useMemo(
    () => currentUser
      ? state.groupMessages.filter((message) => !(message.deletedFor ?? []).includes(currentUser.id))
      : state.groupMessages,
    [currentUser, state.groupMessages]
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
          if ((message.deletedFor ?? []).includes(currentUser.id)) return false;
          const group = resolveGroup(state.groups, state.users, message.groupId, state.groupMessages);
          if (!group?.memberIds.includes(currentUser.id)) return false;
          return !(message.readBy ?? [message.senderId]).includes(currentUser.id);
        })
        .map((message) => message.groupId)
    );
    return unreadGroupIds.size;
  }, [currentUser, state.groupMessages, state.groups, state.users, activeGroupChatId]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    posts: state.posts,
    connections: state.connections,
    groups: visibleGroups,
    groupMessages: groupMessagesForUi,
    notifications: myNotifications,
    settings: state.settings,
    syncPendingCount: state.syncQueue.length,
    online,
    groupsLoading,
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
    deleteNotification,
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
