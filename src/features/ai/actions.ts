import type { AppContextValueForAi } from "./types";
import { generateWeeklyRecap, recapToText } from "./analytics";
import type { AiCommand } from "./commandParser";
import { scheduleTaskReminderNotification } from "@/lib/notifications";

export interface AiActionResult {
  handled: boolean;
  content: string;
  kind?: "text" | "recap" | "action";
}

type LocalTask = {
  id: string;
  content: string;
  completed: boolean;
  reminderAt?: number;
  createdAt: number;
  updatedAt: number;
};

const taskKeyFor = (userId: string) => `taskmates_local_tasks_${userId}`;

const notificationIdFor = (taskId: string) => {
  let hash = 0;
  for (const char of taskId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return 700000 + Math.abs(hash % 200000);
};

const createLocalReminder = async (userId: string, content: string) => {
  const now = Date.now();
  const id = `task_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const reminderAt = now + 60 * 60_000;
  let tasks: LocalTask[] = [];
  try {
    tasks = JSON.parse(localStorage.getItem(taskKeyFor(userId)) ?? "[]") as LocalTask[];
  } catch {
    tasks = [];
  }
  const task: LocalTask = { id, content, completed: false, reminderAt, createdAt: now, updatedAt: now };
  localStorage.setItem(taskKeyFor(userId), JSON.stringify([task, ...tasks]));
  await scheduleTaskReminderNotification(notificationIdFor(id), "Task reminder", content, new Date(reminderAt), "/tasks");
  return task;
};

const normalizeGroupName = (name: string) => name.replace(/^(?:the\s+)?group\s+/i, "").trim().toLowerCase();

export const buildAiContext = (app: AppContextValueForAi) => {
  const groupNames = app.visibleGroups.map((group) => group.name).slice(0, 8).join(", ") || "none";
  const recentPosts = app.posts
    .filter((post) => post.userId === app.currentUser?.id && !post.deletedAt)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 5)
    .map((post) => `- ${post.content.slice(0, 120)}`)
    .join("\n") || "No recent posts.";
  return `User: ${app.currentUser?.username ?? "unknown"}\nTheme: ${app.settings.theme}\nVisible groups: ${groupNames}\nRecent user posts:\n${recentPosts}`;
};

export const executeAiCommand = async (command: AiCommand, app: AppContextValueForAi): Promise<AiActionResult> => {
  if (!app.currentUser) return { handled: true, content: "Sign in first.", kind: "action" };

  if (command.type === "help") {
    return {
      handled: true,
      kind: "text",
      content: "I can write feed posts, send group updates, reply when tagged, switch theme, change auto-delete duration, and generate weekly productivity recaps.",
    };
  }

  if (command.type === "weeklyRecap") {
    const recap = generateWeeklyRecap({
      user: app.currentUser,
      posts: app.posts,
      groups: app.visibleGroups,
      messages: app.groupMessages,
    });
    return { handled: true, content: recapToText(recap), kind: "recap" };
  }

  if (command.type === "theme") {
    app.updateTheme(command.theme);
    return { handled: true, content: `Theme switched to ${command.theme}.`, kind: "action" };
  }

  if (command.type === "notifications") {
    if (app.currentUser.notificationsEnabled !== command.enabled) {
      app.updateUserSettings({ notificationsEnabled: command.enabled });
    }
    return {
      handled: true,
      content: command.enabled ? "Notifications turned on." : "Notifications muted.",
      kind: "action",
    };
  }

  if (command.type === "retention") {
    const days = Math.min(60, Math.max(1, command.days));
    app.updateUserSettings({ retentionDays: days });
    app.runRetentionCleanup();
    return { handled: true, content: `Post auto-delete duration changed to ${days} days.`, kind: "action" };
  }

  if (command.type === "createPost") {
    const now = Date.now();
    const result = app.addPost({
      startTime: command.startTime ?? now - 30 * 60_000,
      endTime: command.endTime ?? now,
      content: command.content,
      visibility: app.currentUser.privacy,
      customUsernames: app.currentUser.privacy === "custom" ? app.currentUser.customUsernames : undefined,
    });
    return { handled: true, content: result.ok ? "Feed post created." : result.error ?? "Could not create the post.", kind: "action" };
  }

  if (command.type === "editPost") {
    const post = app.posts
      .filter((item) => item.userId === app.currentUser?.id && !item.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt || b.startTime - a.startTime)[0];
    if (!post) return { handled: true, content: "I could not find one of your posts to edit.", kind: "action" };
    const result = app.updatePost(post.id, {
      content: command.content,
      startTime: command.startTime ?? post.startTime,
      endTime: command.endTime ?? post.endTime,
    });
    return { handled: true, content: result.ok ? "Latest feed post updated." : result.error ?? "Could not edit the post.", kind: "action" };
  }

  if (command.type === "editPostTiming") {
    const post = app.posts
      .filter((item) => item.userId === app.currentUser?.id && !item.deletedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt || b.startTime - a.startTime)[0];
    if (!post) return { handled: true, content: "I could not find one of your posts to edit.", kind: "action" };
    const result = app.updatePost(post.id, {
      startTime: command.startTime ?? post.startTime,
      endTime: command.endTime ?? post.endTime,
    });
    return { handled: true, content: result.ok ? "Latest post timing updated." : result.error ?? "Could not edit the timing.", kind: "action" };
  }

  if (command.type === "sendGroup") {
    const requestedName = normalizeGroupName(command.groupName);
    const group = app.visibleGroups.find((item) => item.name.toLowerCase() === requestedName)
      ?? app.visibleGroups.find((item) => item.name.toLowerCase().includes(requestedName));
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const result = await app.addGroupMessage(group.id, command.content);
    return { handled: true, content: result.ok ? `Sent to ${group.name}.` : result.error ?? "Could not send the group update.", kind: "action" };
  }

  if (command.type === "reminder") {
    const task = await createLocalReminder(app.currentUser.id, command.content);
    return { handled: true, kind: "action", content: `Reminder created for ${new Date(task.reminderAt!).toLocaleString()}.` };
  }

  return { handled: false, content: "" };
};
