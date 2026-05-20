export type LocalTask = {
  id: string;
  content: string;
  completed: boolean;
  reminderAt?: number;
  createdAt: number;
  updatedAt: number;
};

export const TASKS_CHANGED_EVENT = "taskmates-local-tasks-changed";

export const taskKeyFor = (userId: string) => `taskmates_local_tasks_${userId}`;

export const notificationIdForTask = (taskId: string) => {
  let hash = 0;
  for (const char of taskId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return 700000 + Math.abs(hash % 200000);
};

export const loadLocalTasks = (userId?: string | null): LocalTask[] => {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(taskKeyFor(userId)) ?? "[]") as LocalTask[];
  } catch {
    return [];
  }
};

export const saveLocalTasks = (userId: string, tasks: LocalTask[]) => {
  localStorage.setItem(taskKeyFor(userId), JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail: { userId } }));
};
