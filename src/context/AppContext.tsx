import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppState, AuthResult, Connection, Post, User, Visibility } from "@/types";
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
import { analyzeDayCoverage, dateKey, isValidPostRange, postsInLocalDay, previousLocalDayRange, startOfLocalDay } from "@/lib/timeCoverage";
import { scheduleDailyMidnightNotification } from "@/lib/notifications";

const LS_KEY = "taskmates_activity_state_v1";
const SESSION_KEY = "taskmates_activity_session_v1";
const TOKEN_KEY = "taskmates_firebase_token_v1";
const DEFAULT_THEME: "light" | "dark" = "dark";

interface AppContextValue {
  currentUser: User | null;
  users: User[];
  posts: Post[];
  connections: Connection[];
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
  addPost: (input: { startTime: number; endTime: number; content: string; visibility?: Visibility; customUsernames?: string[] }) => AuthResult;
  updatePost: (id: string, patch: Partial<Pick<Post, "startTime" | "endTime" | "content" | "visibility" | "customUsernames">>) => AuthResult;
  deletePost: (id: string) => void;
  updateUserSettings: (patch: Partial<Pick<User, "privacy" | "customUsernames" | "retentionDays">>) => void;
  updateTheme: (theme: "light" | "dark") => void;
  runRetentionCleanup: () => void;
  visibleFeedPosts: Post[];
}

const AppContext = createContext<AppContextValue | null>(null);

const uid = (prefix = "id") => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const hashPassword = (password: string) => btoa(unescape(encodeURIComponent(password)));

const emptyState = (): AppState => ({
  users: [],
  posts: [],
  connections: [],
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
      settings: nextSettings,
    };
  } catch {
    return emptyState();
  }
};

const queueFor = (collection: "users" | "posts" | "connections", type: "upsert" | "delete", entityId: string, payload?: unknown) => ({
  id: uid("sync"),
  collection,
  type,
  entityId,
  payload,
  updatedAt: Date.now(),
});

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
            ...snapshot,
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
          const syncedPostIds = new Set(
            snapshot.syncQueue
              .filter((op) => completedSet.has(op.id) && op.collection === "posts" && op.type === "upsert")
              .map((op) => op.entityId)
          );
          return {
            ...snapshot,
            posts: snapshot.posts.map((post) => (syncedPostIds.has(post.id) ? { ...post, dirty: false } : post)),
            syncQueue: snapshot.syncQueue.filter((op) => !completedSet.has(op.id)),
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
        // Remove any soft-deleted posts that Firebase has already deleted
        nextPosts = nextPosts.filter((p) => !p.deletedAt);

        let nextConnections = remote.connections ? mergeByFreshness(snapshot.connections, remote.connections) : snapshot.connections;
        // Remove rejected connections
        nextConnections = nextConnections.filter((c) => c.status !== "rejected");

        return {
          ...snapshot,
          users: remote.users ? mergeByFreshness(snapshot.users, remote.users) : snapshot.users,
          posts: nextPosts,
          connections: nextConnections,
        };
      });
    });
  }, [currentUserId]);

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

  // Schedule daily midnight notification for coverage gaps
  useEffect(() => {
    if (!currentUser) return;
    const todayStart = startOfLocalDay(Date.now());
    const todayPosts = postsInLocalDay(state.posts, currentUser.id, todayStart);
    const coverage = analyzeDayCoverage(todayPosts, todayStart);
    scheduleDailyMidnightNotification(!coverage.isComplete);
  }, [currentUser, state.posts]);

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
    if (!request) return;

    if (accept) {
      const updated = { ...request, status: "accepted" as const, updatedAt: Date.now() };
      setState((snapshot) => ({
        ...snapshot,
        connections: snapshot.connections.map((c) => c.id === requestId ? updated : c),
      }));
      commitOperation(queueFor("connections", "upsert", updated.id, updated));
    } else {
      // Reject — remove from local state and delete from Firebase
      setState((snapshot) => ({
        ...snapshot,
        connections: snapshot.connections.filter((c) => c.id !== requestId),
      }));
      commitOperation(queueFor("connections", "delete", request.id));
    }
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

  /** Feed posts visible to current user — derived from connections collection */
  const visibleFeedPosts = useMemo(() => {
    if (!currentUser) return [];
    const connectedIds = new Set(deriveAcceptedIds(state.connections, currentUser.id));
    return state.posts
      .filter((post) => !post.deletedAt && postVisibleTo(post, state.users.find((user) => user.id === post.userId), currentUser, connectedIds))
      .sort((a, b) => b.startTime - a.startTime);
  }, [currentUser, state.posts, state.users, state.connections]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    posts: state.posts,
    connections: state.connections,
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
    addPost,
    updatePost,
    deletePost,
    updateUserSettings,
    updateTheme,
    runRetentionCleanup,
    visibleFeedPosts,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
