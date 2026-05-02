import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { FriendRequest, Task, User, Visibility } from "@/types";

const LS_KEY = "taskmates_state_v2";
const SESSION_KEY = "taskmates_session_v2";

interface State {
  users: User[];
  tasks: Task[];
  requests: FriendRequest[];
  // accepted friendships stored as request rows with status accepted
}

interface AppContextValue {
  currentUser: User | null;
  users: User[];
  tasks: Task[];
  requests: FriendRequest[];

  register: (username: string, password: string) => { ok: boolean; error?: string };
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  updateProfile: (patch: Partial<Pick<User, "bio">>) => void;

  searchUsers: (query: string) => User[];
  sendRequest: (toId: string) => void;
  respondRequest: (requestId: string, accept: boolean) => void;
  getFriends: (userId: string) => User[];
  getFriendshipStatus: (otherId: string) => "self" | "friends" | "incoming" | "outgoing" | "none";

  addTask: (input: {
    title: string;
    description?: string;
    completedAt?: number;
    visibility: Visibility;
    customFriendIds?: string[];
  }) => void;
  updateTask: (
    id: string,
    patch: Partial<Pick<Task, "title" | "description" | "completedAt" | "visibility" | "customFriendIds">>
  ) => void;
  deleteTask: (id: string) => void;

  visibleFeedTasks: Task[]; // for current user dashboard (friends + own public)
}

const AppContext = createContext<AppContextValue | null>(null);

const seed = (): State => {
  const now = Date.now();
  const users: User[] = [
    { id: "u_aria", username: "aria", password: "demo", bio: "Design lead building calmer routines.", createdAt: now - 1e8 },
    { id: "u_julian", username: "julian", password: "demo", bio: "Writing, shipping, and checking in.", createdAt: now - 1e8 },
    { id: "u_elena", username: "elena", password: "demo", bio: "Deep work before lunch.", createdAt: now - 1e8 },
    { id: "u_maya", username: "maya", password: "demo", bio: "Frontend polish and daily movement.", createdAt: now - 1e8 },
  ];
  const tasks: Task[] = [
    { id: "t1", authorId: "u_aria", title: "Mapped the TaskMates launch checklist", description: "Split design, auth, and dashboard tasks.", completedAt: now - 3600_000, visibility: "public" },
    { id: "t2", authorId: "u_julian", title: "Finished the weekly writing block", completedAt: now - 7200_000, visibility: "public" },
    { id: "t3", authorId: "u_elena", title: "Reviewed sprint notes", description: "Pulled three blockers into tomorrow's plan.", completedAt: now - 600_000, visibility: "custom", customFriendIds: ["u_aria"] },
    { id: "t4", authorId: "u_maya", title: "Walked before standup", completedAt: now - 9_600_000, visibility: "public" },
  ];
  const requests: FriendRequest[] = [
    { id: "r1", fromId: "u_aria", toId: "u_julian", status: "accepted", createdAt: now - 5e7 },
    { id: "r2", fromId: "u_elena", toId: "u_aria", status: "accepted", createdAt: now - 4e7 },
    { id: "r3", fromId: "u_maya", toId: "u_aria", status: "pending", createdAt: now - 3e7 },
  ];
  return { users, tasks, requests };
};

const load = (): State => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seed();
  }
};

const save = (s: State) => localStorage.setItem(LS_KEY, JSON.stringify(s));

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<State>(() => load());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));

  useEffect(() => save(state), [state]);
  useEffect(() => {
    if (currentUserId) localStorage.setItem(SESSION_KEY, currentUserId);
    else localStorage.removeItem(SESSION_KEY);
  }, [currentUserId]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === currentUserId) ?? null,
    [state.users, currentUserId]
  );

  const register: AppContextValue["register"] = (username, password) => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
    if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, error: "Letters, numbers, underscores only." };
    if (password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    if (state.users.some((x) => x.username === u)) return { ok: false, error: "Username already taken." };
    const user: User = { id: uid("u"), username: u, password, createdAt: Date.now() };
    setState((s) => ({ ...s, users: [...s.users, user] }));
    setCurrentUserId(user.id);
    return { ok: true };
  };

  const login: AppContextValue["login"] = (username, password) => {
    const u = state.users.find((x) => x.username === username.trim().toLowerCase());
    if (!u || u.password !== password) return { ok: false, error: "Invalid username or password." };
    setCurrentUserId(u.id);
    return { ok: true };
  };

  const logout = () => setCurrentUserId(null);

  const updateProfile: AppContextValue["updateProfile"] = (patch) => {
    if (!currentUser) return;
    setState((s) => ({
      ...s,
      users: s.users.map((u) => (u.id === currentUser.id ? { ...u, ...patch } : u)),
    }));
  };

  const searchUsers = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return state.users.filter((u) => u.username.includes(q) && u.id !== currentUserId).slice(0, 20);
    },
    [state.users, currentUserId]
  );

  const sendRequest: AppContextValue["sendRequest"] = (toId) => {
    if (!currentUser || toId === currentUser.id) return;
    const exists = state.requests.find(
      (r) =>
        ((r.fromId === currentUser.id && r.toId === toId) ||
          (r.fromId === toId && r.toId === currentUser.id)) &&
        r.status !== "rejected"
    );
    if (exists) return;
    const req: FriendRequest = {
      id: uid("r"),
      fromId: currentUser.id,
      toId,
      status: "pending",
      createdAt: Date.now(),
    };
    setState((s) => ({ ...s, requests: [...s.requests, req] }));
  };

  const respondRequest: AppContextValue["respondRequest"] = (requestId, accept) => {
    setState((s) => ({
      ...s,
      requests: s.requests.map((r) =>
        r.id === requestId ? { ...r, status: accept ? "accepted" : "rejected" } : r
      ),
    }));
  };

  const getFriends: AppContextValue["getFriends"] = (userId) => {
    const ids = state.requests
      .filter((r) => r.status === "accepted" && (r.fromId === userId || r.toId === userId))
      .map((r) => (r.fromId === userId ? r.toId : r.fromId));
    return state.users.filter((u) => ids.includes(u.id));
  };

  const getFriendshipStatus: AppContextValue["getFriendshipStatus"] = (otherId) => {
    if (!currentUser) return "none";
    if (otherId === currentUser.id) return "self";
    const r = state.requests.find(
      (r) =>
        ((r.fromId === currentUser.id && r.toId === otherId) ||
          (r.fromId === otherId && r.toId === currentUser.id)) &&
        r.status !== "rejected"
    );
    if (!r) return "none";
    if (r.status === "accepted") return "friends";
    return r.fromId === currentUser.id ? "outgoing" : "incoming";
  };

  const addTask: AppContextValue["addTask"] = (input) => {
    if (!currentUser) return;
    const task: Task = {
      id: uid("t"),
      authorId: currentUser.id,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      completedAt: input.completedAt ?? Date.now(),
      visibility: input.visibility,
      customFriendIds: input.visibility === "custom" ? input.customFriendIds ?? [] : undefined,
    };
    setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
  };

  const updateTask: AppContextValue["updateTask"] = (id, patch) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              customFriendIds:
                (patch.visibility ?? t.visibility) === "custom"
                  ? patch.customFriendIds ?? t.customFriendIds ?? []
                  : undefined,
            }
          : t
      ),
    }));
  };

  const deleteTask: AppContextValue["deleteTask"] = (id) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  };

  const visibleFeedTasks = useMemo(() => {
    if (!currentUser) return [];
    const friendIds = new Set(getFriends(currentUser.id).map((u) => u.id));
    return state.tasks
      .filter((t) => {
        if (t.authorId === currentUser.id) return true;
        if (t.visibility === "private") return false;
        if (t.visibility === "public") return friendIds.has(t.authorId);
        if (t.visibility === "custom") return (t.customFriendIds ?? []).includes(currentUser.id);
        return false;
      })
      .sort((a, b) => b.completedAt - a.completedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, state.requests, currentUser]);

  const value: AppContextValue = {
    currentUser,
    users: state.users,
    tasks: state.tasks,
    requests: state.requests,
    register,
    login,
    logout,
    updateProfile,
    searchUsers,
    sendRequest,
    respondRequest,
    getFriends,
    getFriendshipStatus,
    addTask,
    updateTask,
    deleteTask,
    visibleFeedTasks,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
