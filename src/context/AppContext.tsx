import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppNotification, AppState, AuthResult, Connection, Group, GroupMessage, Post, SyncCollection, SyncOperation, User, Visibility } from "@/types";
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
import { analyzeDayCoverage, isValidPostRange, postsInLocalDay, startOfLocalDay, gapLabel } from "@/lib/timeCoverage";
import { requestNotificationPermission, scheduleDailyMidnightNotification, showLocalNotification } from "@/lib/notifications";
import { initFCMPush, sendFCMPush } from "@/lib/pushNotifications";

const LS_KEY = "taskmates_activity_state_v1";
const SESSION_KEY = "taskmates_activity_session_v1";
const TOKEN_KEY = "taskmates_firebase_token_v1";
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
  addGroupMessage: (groupId: string, content: string) => AuthResult;
  markGroupMessagesRead: (groupId: string) => void;
  markGroupNotificationsRead: (groupId: string) => void;
  toggleMuteGroup: (groupId: string) => void;
  isGroupMuted: (groupId: string) => boolean;
  addPost: (input: { startTime: number; endTime: number; content: string; visibility?: Visibility; customUsernames?: string[] }) => AuthResult;
  updatePost: (id: string, patch: Partial<Pick<Post, "startTime" | "endTime" | "content" | "visibility" | "customUsernames">>) => AuthResult;
  deletePost: (id: string) => void;
  updateUserSettings: (patch: Partial<Pick<User, "privacy" | "customUsernames" | "retentionDays">>) => void;
  updateTheme: (theme: "light" | "dark") => void;
  runRetentionCleanup: () => void;
  markNotificationsRead: () => void;
  unreadNotificationCount: number;
  pendingRequestCount: number;
  unreadGroupCount: number;
  visibleFeedPosts: Post[];
  visibleGroups: Group[];
}

const AppContext = createContext<AppContextValue | null>(null);

const uid = (prefix = "id") => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const hashPassword = (password: string) => btoa(unescape(encodeURIComponent(password)));

const emptyState = (): AppState => ({
  users: [],
  posts: [],
  connections: [],
  groups: [],
  groupMessages: [],
  notifications: [],
  syncQueue: [],
  settings: { theme: DEFAULT_THEME },
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

const mergeIds = (a?: string[], b?: string[]) => [...new Set([...(a ?? []), ...(b ?? [])])];

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
      existing.createdAt === item.createdAt;

    map.set(item.id, {
      ...existing,
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
    return subscribeFirebaseState((remote) => {
      setState((snapshot) => {
        let nextPosts = remote.posts ? mergeByFreshness(snapshot.posts, remote.posts) : snapshot.posts;
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
        const tenDaysAgo = Date.now() - 10 * 86_400_000;
        let nextNotifications = remote.notifications
          ? mergeByFreshness(snapshot.notifications, remote.notifications)
          : snapshot.notifications;
        nextNotifications = nextNotifications.filter(
          (n) => n.recipientId === currentUserId && n.createdAt > tenDaysAgo
        );

        return {
          ...snapshot,
          users: remote.users ? mergeByFreshness(snapshot.users, remote.users) : snapshot.users,
          posts: nextPosts,
          connections: nextConnections,
          groups: remote.groups ? mergeByFreshness(snapshot.groups, remote.groups) : snapshot.groups,
          groupMessages: remote.groupMessages ? mergeGroupMessages(snapshot.groupMessages, remote.groupMessages) : snapshot.groupMessages,
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
    const timer = window.setTimeout(() => {
      requestNotificationPermission().then((granted) => {
        if (granted) {
          console.log("Notification permission granted");
          void initFCMPush(currentUser.id, (title, body) => {
            void showLocalNotification(title, body);
          });
        } else {
          console.warn("Notification permission denied");
        }
      });
    }, 1500); // 1.5s delay to ensure Android WebView is fully loaded
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  // Clean up old notifications (>10 days) from Firebase
  useEffect(() => {
    const tenDaysAgo = Date.now() - 10 * 86_400_000;
    const expired = state.notifications.filter((n) => n.createdAt <= tenDaysAgo);
    if (expired.length === 0) return;
    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.filter((n) => n.createdAt > tenDaysAgo),
    }));
    for (const n of expired) {
      commitOperation(queueFor("notifications", "delete", n.id));
    }
  }, [state.notifications, commitOperation]);

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
      const expiredIds = new Set<string>();
      for (const post of snapshot.posts) {
        const owner = snapshot.users.find((user) => user.id === post.userId);
        const retentionDays = owner?.retentionDays ?? 15;
        if (!post.deletedAt && now - post.endTime > retentionDays * 86_400_000) expiredIds.add(post.id);
      }
      if (!expiredIds.size) return { ...snapshot, settings: { ...snapshot.settings, lastRetentionRun: now } };
      return {
        ...snapshot,
        // Hard-remove expired posts from local state
        posts: snapshot.posts.filter((post) => !expiredIds.has(post.id)),
        syncQueue: [
          ...snapshot.syncQueue,
          ...[...expiredIds].map((id) => queueFor("posts", "delete", id)),
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
      void sendFCMPush(recipientId, title, body, type);
    },
    [currentUser, commitOperation]
  );

  // Schedule daily midnight notification for coverage gaps
  useEffect(() => {
    if (!currentUser) return;
    const todayStart = startOfLocalDay(Date.now());
    const todayPosts = postsInLocalDay(state.posts, currentUser.id, todayStart);
    const coverage = analyzeDayCoverage(todayPosts, todayStart);
    const gapList = coverage.gaps.length > 0 ? coverage.gaps.map(gapLabel).join(", ") : undefined;
    scheduleDailyMidnightNotification(!coverage.isComplete, gapList);

    // Also create a Firebase notification at midnight for gaps
    const scheduleMidnightCheck = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return window.setTimeout(() => {
        const dayStart = startOfLocalDay(Date.now());
        const dayPosts = postsInLocalDay(state.posts, currentUser.id, dayStart);
        const dayCoverage = analyzeDayCoverage(dayPosts, dayStart);
        if (!dayCoverage.isComplete) {
          const gaps = dayCoverage.gaps.map(gapLabel).join(", ");
          // Create a self-notification stored in Firebase
          const now = Date.now();
          const notif: AppNotification = {
            id: uid("notif"),
            recipientId: currentUser.id,
            type: "unlogged_gaps",
            title: "Unlogged Activity Gaps",
            body: `You forgot to log: ${gaps}`,
            link: "/dashboard",
            read: false,
            createdAt: now,
            updatedAt: now,
          };
          setState((s) => ({ ...s, notifications: [...s.notifications, notif] }));
          commitOperation(queueFor("notifications", "upsert", notif.id, notif));
        }
      }, Math.max(1000, next.getTime() - Date.now()));
    };
    const timer = scheduleMidnightCheck();
    return () => window.clearTimeout(timer);
  }, [currentUser, state.posts, commitOperation]);

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

  const addGroupMessage: AppContextValue["addGroupMessage"] = (groupId, content) => {
    if (!currentUser) return { ok: false, error: "Sign in first." };
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || !group.memberIds.includes(currentUser.id)) return { ok: false, error: "Group not found." };
    const clean = content.trim();
    if (!clean) return { ok: false, error: "Type a message first." };

    const now = Date.now();
    const message: GroupMessage = {
      id: uid("gm"),
      groupId,
      senderId: currentUser.id,
      content: clean,
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
          `${currentUser.username}: ${clean.slice(0, 100)}`,
          `/groups/${groupId}`
        );
      }
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
    if (input.startTime > Date.now() || input.endTime > Date.now()) return { ok: false, error: "Future activity cannot be posted." };
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
    if (next.startTime > Date.now() || next.endTime > Date.now()) return { ok: false, error: "Future activity cannot be posted." };
    if (!isValidPostRange(next.startTime, next.endTime)) return { ok: false, error: "Posts must cover at least 5 minutes." };
    if (!next.content) return { ok: false, error: "Add what happened during this time." };
    const operation = queueFor("posts", "upsert", next.id, next);
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

  const markNotificationsRead: AppContextValue["markNotificationsRead"] = () => {
    if (!currentUser) return;
    const changedNotifications = state.notifications
      .filter((notification) => notification.recipientId === currentUser.id && !notification.read)
      .map((notification) => ({ ...notification, read: true, updatedAt: Date.now() }));
    const changedById = new Map(changedNotifications.map((notification) => [notification.id, notification]));

    setState((snapshot) => ({
      ...snapshot,
      notifications: snapshot.notifications.map((notification) => changedById.get(notification.id) ?? notification),
      settings: { ...snapshot.settings, notificationLastSeen: Date.now() },
    }));
    for (const notification of changedNotifications) {
      commitOperation(queueFor("notifications", "upsert", notification.id, notification));
    }
  };

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

  const myNotifications = useMemo(() => {
    if (!currentUser) return [];
    return state.notifications
      .filter((n) => n.recipientId === currentUser.id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [currentUser, state.notifications]);

  const unreadNotificationCount = useMemo(() => {
    return myNotifications.filter((n) => !n.read).length;
  }, [myNotifications]);

  const pendingRequestCount = useMemo(() => {
    if (!currentUser) return 0;
    return state.connections.filter((c) => c.receiverId === currentUser.id && c.status === "pending").length;
  }, [currentUser, state.connections]);

  const unreadGroupCount = useMemo(() => {
    if (!currentUser) return 0;
    return myNotifications.filter((n) => n.type === "group_message" && !n.read).length;
  }, [currentUser, myNotifications]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    posts: state.posts,
    connections: state.connections,
    groups: state.groups,
    groupMessages: state.groupMessages,
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
    markGroupMessagesRead,
    markGroupNotificationsRead,
    toggleMuteGroup,
    isGroupMuted,
    addPost,
    updatePost,
    deletePost,
    updateUserSettings,
    updateTheme,
    runRetentionCleanup,
    markNotificationsRead,
    unreadNotificationCount,
    pendingRequestCount,
    unreadGroupCount,
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
