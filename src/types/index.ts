export type Visibility = "public" | "connections" | "custom";

export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface User {
  id: string;
  username: string;
  email: string;
  publicKey?: string;
  privacy: Visibility;
  customUsernames: string[];
  retentionDays: number;
  theme?: "light" | "dark";
  timeFormat?: "12" | "24";
  mutedGroupIds?: string[];
  notificationsEnabled?: boolean;
  lastSeen?: number;
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
  likes?: string[];
  reactions?: Record<string, string>;
  comments?: PostComment[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dirty?: boolean;
}

export interface PostComment {
  id: string;
  userId: string;
  content: string;
  parentCommentId?: string;
  createdAt: number;
  updatedAt: number;
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
  encryptedKeys?: Record<string, string>;
  encryptionVersion?: number;
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  content: string;
  encrypted?: boolean;
  encryptionVersion?: number;
  ciphertext?: string;
  iv?: string;
  encryptedKeys?: Record<string, string>;
  recipientIds?: string[];
  replyToMessageId?: string;
  pinnedBy?: string[];
  reactions?: Record<string, string>;
  deliveredTo?: string[];
  readBy?: string[];
  deletedFor?: string[];
  editedAt?: number;
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "unlogged_gaps"
  | "group_message"
  | "group_reaction"
  | "post_like"
  | "post_comment"
  | "post_reply";

export interface AppNotification {
  id: string;
  /** The user who will receive this notification */
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional link to navigate to when tapped */
  link?: string;
  /** Whether the user has seen this notification */
  read?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TimeGap {
  start: number;
  end: number;
}

export type SyncCollection = "users" | "posts" | "connections" | "groups" | "groupMessages" | "notifications";

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
  timeFormat?: "12" | "24";
  lastRetentionRun?: number;
  notificationLastSeen?: number;
}

export interface AppState {
  users: User[];
  posts: Post[];
  connections: Connection[];
  groups: Group[];
  groupMessages: GroupMessage[];
  notifications: AppNotification[];
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
