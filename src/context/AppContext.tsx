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
import { notifyCoverageGap, scheduleCoverageReminderForNextMidnight } from "@/lib/notifications";

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
  coverageAlerts: AppState["coverageAlerts"];
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
  getConnections: (userId: string) => User[];
  getConnectionStatus: (otherId: string) => "self" | "connected" | "incoming" | "outgoing" | "none";
  addPost: (input: { startTime: number; endTime: number; content: string; visibility?: Visibility; customUsernames?: string[] }) => AuthResult;
  updatePost: (id: string, patch: Partial<Pick<Post, "startTime" | "endTime" | "content" | "visibility" | "customUsernames">>) => AuthResult;
  deletePost: (id: string) => void;
  updateUserSettings: (patch: Partial<Pick<User, "privacy" | "customUsernames" | "retentionDays">>) => void;
  updateTheme: (theme: "light" | "dark") => void;
  runCoverageCheck: (now?: number) => void;
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
  coverageAlerts: [],
  syncQueue: [],
  settings: { theme: DEFAULT_THEME },
});

const seed = (): AppState => {
  const now = Date.now();
  const today = startOfLocalDay(now);
  const users: User[] = [
    makeUser("u_aria", "aria", now - 8e7, "demo"),
    makeUser("u_maya", "maya", now - 7e7, "demo"),
    makeUser("u_julian", "julian", now - 6e7, "demo"),
  ];
  users[0].connections = ["u_maya", "u_julian"];
  users[1].connections = ["u_aria"];
  users[2].connections = ["u_aria"];

  return {
    users,
    posts: [
      makePost("p1", "u_aria", today + 8 * 60 * 60_000, today + 10 * 60 * 60_000, "Planning, breakfast, and inbox triage.", "public"),
      makePost("p2", "u_maya", today + 9 * 60 * 60_000, today + 11 * 60 * 60_000, "Morning walk and design review.", "public"),
      makePost("p3", "u_julian", today + 13 * 60 * 60_000, today + 14 * 60 * 60_000, "Writing block with a quiet phone.", "connections"),
    ],
    connections: [
      { id: "c1", senderId: "u_aria", receiverId: "u_maya", status: "accepted", createdAt: now - 5e7, updatedAt: now - 5e7 },
      { id: "c2", senderId: "u_julian", receiverId: "u_aria", status: "accepted", createdAt: now - 4e7, updatedAt: now - 4e7 },
    ],
    coverageAlerts: [],
    syncQueue: [],
    settings: { theme: DEFAULT_THEME },
  };
};

const makeUser = (id: string, username: string, createdAt: number, password: string): User => ({
  id,
  username,
  email: usernameToEmail(username),
  connections: [],
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
      const initial = hasFirebaseConfig ? emptyState() : seed();
      localStorage.setItem(LS_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as AppState;
    const isDemoOnly =
      hasFirebaseConfig &&
      parsed.users.length > 0 &&
      parsed.users.every((user) => ["u_aria", "u_maya", "u_julian"].includes(user.id));
    const nextSettings = {
      ...parsed.settings,
      theme: parsed.settings?.theme ?? DEFAULT_THEME,
    };
    return isDemoOnly ? { ...emptyState(), settings: nextSettings } : { ...parsed, settings: nextSettings };
  } catch {
    return hasFirebaseConfig ? emptyState() : seed();
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

const postVisibleTo = (post: Post, author: User | undefined, viewer: User, connectedIds: Set<string>) => {
  if (post.deletedAt || post.userId === viewer.id) return !post.deletedAt;
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
              .filter((operation) => completedSet.has(operation.id) && operation.collection === "posts" && operation.type === "upsert")
              .map((operation) => operation.entityId)
          );

          return {
            ...snapshot,
            posts: snapshot.posts.map((post) => (syncedPostIds.has(post.id) ? { ...post, dirty: false } : post)),
            syncQueue: snapshot.syncQueue.filter((operation) => !completedSet.has(operation.id)),
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

  useEffect(() => {
    if (!hasFirebaseConfig || !currentUserId) return;
    return subscribeFirebaseState((remote) => {
      setState((snapshot) => ({
        ...snapshot,
        users: remote.users ? mergeByFreshness(snapshot.users, remote.users) : snapshot.users,
        posts: remote.posts ? mergeByFreshness(snapshot.posts, remote.posts) : snapshot.posts,
        connections: remote.connections ? mergeByFreshness(snapshot.connections, remote.connections) : snapshot.connections,
      }));
    });
  }, [currentUserId]);

  const getConnections = useCallback(
    (userId: string) => state.users.filter((user) => user.connections.includes(userId)),
    [state.users]
  );

  const runCoverageCheck = useCallback((now = Date.now()) => {
    setState((snapshot) => {
      const range = previousLocalDayRange(now);
      const key = dateKey(range.start);
      if (snapshot.settings.lastCoverageRunDateKey === key) return snapshot;
      const alerts = [...snapshot.coverageAlerts];

      for (const user of snapshot.users) {
        const dayPosts = postsInLocalDay(snapshot.posts, user.id, range.start);
        const coverage = analyzeDayCoverage(dayPosts, range.start);
        if (!coverage.isComplete) {
          const exists = alerts.some((alert) => alert.userId === user.id && alert.dateKey === key);
          if (!exists) {
            alerts.push({ id: uid("alert"), userId: user.id, dateKey: key, gaps: coverage.gaps, createdAt: now, seen: false });
            if (user.id === currentUserId) notifyCoverageGap(coverage.gaps);
          }
        }
      }

      return { ...snapshot, coverageAlerts: alerts, settings: { ...snapshot.settings, lastCoverageRunDateKey: key } };
    });
  }, [currentUserId]);

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
        posts: snapshot.posts.map((post) => expiredIds.has(post.id) ? { ...post, deletedAt: now, updatedAt: now, dirty: true } : post),
        syncQueue: [
          ...snapshot.syncQueue,
          ...[...expiredIds].map((id) => queueFor("posts", "delete", id)),
        ],
        settings: { ...snapshot.settings, lastRetentionRun: now },
      };
    });
  }, []);

  useEffect(() => {
    const schedule = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      const timeout = window.setTimeout(() => {
        runCoverageCheck();
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
  }, [runCoverageCheck, runRetentionCleanup]);

  useEffect(() => {
    if (!currentUser) return;
    const todayStart = startOfLocalDay(Date.now());
    const todayPosts = postsInLocalDay(state.posts, currentUser.id, todayStart);
    const coverage = analyzeDayCoverage(todayPosts, todayStart);
    scheduleCoverageReminderForNextMidnight(!coverage.isComplete);
  }, [currentUser, state.posts]);

  const register: AppContextValue["register"] = async (username, password, confirmPassword) => {
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(clean)) return { ok: false, error: "Use 3-24 lowercase letters, numbers, or underscores." };
    if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if (password !== confirmPassword) return { ok: false, error: "Passwords do not match." };
    if (state.users.some((user) => user.username === clean)) return { ok: false, error: "Username already taken." };

    const email = usernameToEmail(clean);
    let firebaseId: string | undefined;
    try {
      if (online) {
        const account = await firebaseCreateAccount(email, password);
        firebaseId = account?.localId;
        if (account?.idToken) localStorage.setItem(TOKEN_KEY, account.idToken);
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Firebase signup failed." };
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
              connections: [],
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

  const searchUsers = useCallback((query: string) => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    const connectedIds = currentUser?.connections ?? [];
    return state.users.filter((user) => user.username.startsWith(clean) && user.id !== currentUserId && !connectedIds.includes(user.id)).slice(0, 20);
  }, [currentUserId, currentUser?.connections, state.users]);

  const getConnectionStatus: AppContextValue["getConnectionStatus"] = (otherId) => {
    if (!currentUser) return "none";
    if (otherId === currentUser.id) return "self";
    if (currentUser.connections.includes(otherId)) return "connected";
    const request = state.connections.find(
      (connection) =>
        connection.status === "pending" &&
        ((connection.senderId === currentUser.id && connection.receiverId === otherId) ||
          (connection.senderId === otherId && connection.receiverId === currentUser.id))
    );
    if (!request) return "none";
    return request.senderId === currentUser.id ? "outgoing" : "incoming";
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
    const updatedUsers = state.users.map((user) => {
      if (user.id === currentUser.id) {
        return { ...user, connections: user.connections.filter((id) => id !== userId), updatedAt: Date.now() };
      }
      if (user.id === userId) {
        return { ...user, connections: user.connections.filter((id) => id !== currentUser.id), updatedAt: Date.now() };
      }
      return user;
    });
    setState((snapshot) => {
      const updatedConnections = snapshot.connections.filter(
        (conn) => !connectionsToDelete.find((dc) => dc.id === conn.id)
      );
      const userOpsQueue = connectionsToDelete.map((conn) => queueFor("connections", "delete", conn.id));
      const userUpdateOps = updatedUsers
        .filter((user) => user.id === currentUser.id || user.id === userId)
        .map((user) => queueFor("users", "upsert", user.id, user));
      return {
        ...snapshot,
        users: updatedUsers,
        connections: updatedConnections,
        syncQueue: [...snapshot.syncQueue, ...userOpsQueue, ...userUpdateOps],
      };
    });
    toast.success("Connection removed.");
  };

  const respondRequest: AppContextValue["respondRequest"] = (requestId, accept) => {
    const request = state.connections.find((connection) => connection.id === requestId);
    if (!request) return;
    const updated = { ...request, status: accept ? "accepted" : "rejected", updatedAt: Date.now() } satisfies Connection;
    const updatedUsers = accept
      ? state.users.map((user) => {
        if (user.id === request.senderId && !user.connections.includes(request.receiverId)) return { ...user, connections: [...user.connections, request.receiverId], updatedAt: Date.now() };
        if (user.id === request.receiverId && !user.connections.includes(request.senderId)) return { ...user, connections: [...user.connections, request.senderId], updatedAt: Date.now() };
        return user;
      })
      : state.users;

    setState((snapshot) => ({
      ...snapshot,
      users: updatedUsers,
      connections: snapshot.connections.map((connection) => connection.id === requestId ? updated : connection),
    }));

    commitOperation(queueFor("connections", "upsert", updated.id, updated));
    updatedUsers
      .filter((user) => user.id === request.senderId || user.id === request.receiverId)
      .forEach((user) => commitOperation(queueFor("users", "upsert", user.id, user)));
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
    const operation = queueFor("posts", "delete", id);
    setState((snapshot) => ({
      ...snapshot,
      posts: snapshot.posts.map((post) => post.id === id && post.userId === currentUser?.id ? { ...post, deletedAt: Date.now(), updatedAt: Date.now(), dirty: true } : post),
    }));
    commitOperation(operation);
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

  const visibleFeedPosts = useMemo(() => {
    if (!currentUser) return [];
    const connectedIds = new Set(currentUser.connections);
    return state.posts
      .filter((post) => postVisibleTo(post, state.users.find((user) => user.id === post.userId), currentUser, connectedIds))
      .sort((a, b) => b.startTime - a.startTime);
  }, [currentUser, state.posts, state.users]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    posts: state.posts,
    connections: state.connections,
    settings: state.settings,
    coverageAlerts: state.coverageAlerts,
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
    getConnections,
    getConnectionStatus,
    addPost,
    updatePost,
    deletePost,
    updateUserSettings,
    updateTheme,
    runCoverageCheck,
    runRetentionCleanup,
    visibleFeedPosts,
  };

  useEffect(() => {
    const userAlerts = state.coverageAlerts.filter((alert) => alert.userId === currentUserId && !alert.seen);
    if (userAlerts[0]) toast.warning("You missed logging activity for some time today");
  }, [currentUserId, state.coverageAlerts]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
