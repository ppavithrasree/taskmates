import { AI_STORAGE_KEYS } from "./constants";

export interface ScheduledAiAction {
  id: string;
  type: "sendGroup";
  userId: string;
  groupId: string;
  groupName: string;
  content: string;
  runAt: number;
  createdAt: number;
}

const keyFor = (userId: string) => `${AI_STORAGE_KEYS.scheduledActions}:${userId}`;

export const loadScheduledAiActions = (userId?: string | null): ScheduledAiAction[] => {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "[]") as ScheduledAiAction[];
    return parsed.filter((item) => item.userId === userId && item.type === "sendGroup" && Number.isFinite(item.runAt));
  } catch {
    return [];
  }
};

export const saveScheduledAiActions = (userId: string, actions: ScheduledAiAction[]) => {
  localStorage.setItem(keyFor(userId), JSON.stringify(actions.slice(-50)));
};

export const addScheduledAiAction = (action: ScheduledAiAction) => {
  const actions = loadScheduledAiActions(action.userId).filter((item) => item.id !== action.id);
  saveScheduledAiActions(action.userId, [...actions, action].sort((a, b) => a.runAt - b.runAt));
  window.dispatchEvent(new Event("taskmates-ai-scheduled-actions"));
};
