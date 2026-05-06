export type Visibility = "public" | "connections" | "custom";

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface User {
  id: string;
  username: string;
  email: string;
  privacy: Visibility;
  customUsernames: string[];
  retentionDays: number;
  theme?: "light" | "dark";
  createdAt: number;
  updatedAt: number;
  passwordHash?: string;
  /** @deprecated kept for backward compat with old local storage data */
  connections?: string[];
}

export interface Post {
  id: string;
  userId: string;
  startTime: number;
  endTime: number;
  content: string;
  visibility?: Visibility;
  customUsernames?: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dirty?: boolean;
}

export interface Connection {
  id: string;
  senderId: string;
  receiverId: string;
  status: ConnectionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  memberIds: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

export interface TimeGap {
  start: number;
  end: number;
}

export type SyncCollection = "users" | "posts" | "connections" | "groups" | "groupMessages";

export interface SyncOperation {
  id: string;
  collection: SyncCollection;
  type: "upsert" | "delete";
  entityId: string;
  payload?: unknown;
  updatedAt: number;
}

export interface AppSettings {
  theme: "light" | "dark";
  lastRetentionRun?: number;
}

export interface AppState {
  users: User[];
  posts: Post[];
  connections: Connection[];
  groups: Group[];
  groupMessages: GroupMessage[];
  syncQueue: SyncOperation[];
  settings: AppSettings;
}

export interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}
