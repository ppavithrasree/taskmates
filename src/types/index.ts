export type Visibility = "public" | "connections" | "custom";

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface User {
  id: string;
  username: string;
  email: string;
  connections: string[];
  privacy: Visibility;
  customUsernames: string[];
  retentionDays: number;
  theme?: "light" | "dark";
  createdAt: number;
  updatedAt: number;
  passwordHash?: string;
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

export interface CoverageAlert {
  id: string;
  userId: string;
  dateKey: string;
  gaps: TimeGap[];
  createdAt: number;
  seen: boolean;
}

export interface TimeGap {
  start: number;
  end: number;
}

export interface SyncOperation {
  id: string;
  collection: "users" | "posts" | "connections";
  type: "upsert" | "delete";
  entityId: string;
  payload?: unknown;
  updatedAt: number;
}

export interface AppSettings {
  theme: "light" | "dark";
  lastCoverageRunDateKey?: string;
  lastRetentionRun?: number;
}

export interface AppState {
  users: User[];
  posts: Post[];
  connections: Connection[];
  coverageAlerts: CoverageAlert[];
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
