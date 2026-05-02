export type Visibility = "public" | "private" | "custom";

export interface User {
  id: string;
  username: string;
  password: string; // Demo only: stored locally in the browser.
  bio?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  completedAt: number;
  visibility: Visibility;
  customFriendIds?: string[];
}

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  status: FriendRequestStatus;
  createdAt: number;
}
