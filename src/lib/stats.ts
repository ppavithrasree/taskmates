import type { Task } from "@/types";

const DAY_MS = 86_400_000;

export const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const isToday = (timestamp: number) =>
  startOfDay(timestamp) === startOfDay(Date.now());

export const computeStreak = (timestamps: number[]) => {
  if (timestamps.length === 0) return 0;

  const days = new Set(timestamps.map(startOfDay));
  let cursor = startOfDay(Date.now());
  let streak = 0;

  if (!days.has(cursor)) cursor -= DAY_MS;

  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }

  return streak;
};

export const taskStats = (tasks: Task[]) => ({
  today: tasks.filter((task) => isToday(task.completedAt)).length,
  total: tasks.length,
  streak: computeStreak(tasks.map((task) => task.completedAt)),
});
