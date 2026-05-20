import type { AppContextValueForAi } from "./types";
import { generateWeeklyRecap, recapToText } from "./analytics";
import type { AiCommand } from "./commandParser";
import { scheduleTaskReminderNotification } from "@/lib/notifications";
import { addScheduledAiAction } from "./scheduledActions";
import type { Post, PostComment, User } from "@/types";
import { loadLocalTasks, notificationIdForTask, saveLocalTasks, type LocalTask } from "@/lib/localTasks";

export interface AiActionResult {
  handled: boolean;
  content: string;
  kind?: "text" | "recap" | "action";
}

const createLocalReminder = async (userId: string, content: string, reminderAt?: number) => {
  const now = Date.now();
  const id = `task_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const scheduledAt = reminderAt && reminderAt > now ? reminderAt : now + 60 * 60_000;
  const tasks: LocalTask[] = loadLocalTasks(userId);
  const task: LocalTask = { id, content, completed: false, reminderAt, createdAt: now, updatedAt: now };
  task.reminderAt = scheduledAt;
  saveLocalTasks(userId, [task, ...tasks]);
  await scheduleTaskReminderNotification(notificationIdForTask(id), "Task reminder", content, new Date(scheduledAt), "/tasks");
  return task;
};

const normalizeGroupName = (name: string) => name.replace(/^(?:the\s+)?group\s+/i, "").trim().toLowerCase();

const resolveGroup = (app: AppContextValueForAi, groupName: string) => {
  const requestedName = normalizeGroupName(groupName);
  return app.visibleGroups.find((item) => item.name.toLowerCase() === requestedName)
    ?? app.visibleGroups.find((item) => item.name.toLowerCase().includes(requestedName));
};

const normalizeUsername = (username: string) => username.replace(/^@/, "").trim().toLowerCase();

const resolveUser = (app: AppContextValueForAi, username: string): User | undefined => {
  const clean = normalizeUsername(username);
  return app.users.find((user) => user.username.toLowerCase() === clean)
    ?? app.users.find((user) => user.username.toLowerCase().startsWith(clean));
};

const resolveUsers = (app: AppContextValueForAi, usernames: string[]) =>
  usernames.map((username) => resolveUser(app, username)).filter(Boolean) as User[];

const latestPost = (posts: Post[], currentUserId?: string, mineOnly = false) =>
  posts
    .filter((item) => !item.deletedAt && (!mineOnly || item.userId === currentUserId))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.startTime - a.startTime)[0];

const latestOwnComment = (posts: Post[], currentUserId?: string): { post: Post; comment: PostComment } | null => {
  for (const post of [...posts].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const comment = [...(post.comments ?? [])]
      .filter((item) => item.userId === currentUserId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (comment) return { post, comment };
  }
  return null;
};

const resolveMessage = (app: AppContextValueForAi, groupName?: string, text?: string, mineOnly = false) => {
  const group = groupName ? resolveGroup(app, groupName) : undefined;
  const needle = text?.toLowerCase().trim();
  return [...app.groupMessages]
    .filter((message) =>
      (!group || message.groupId === group.id) &&
      (!mineOnly || message.senderId === app.currentUser?.id) &&
      (!needle || message.content.toLowerCase().includes(needle))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
};

export const buildAiContext = (app: AppContextValueForAi) => {
  const groupNames = app.visibleGroups.map((group) => group.name).slice(0, 12).join(", ") || "none";
  const incomingRequests = app.connections
    .filter((connection) => connection.receiverId === app.currentUser?.id && connection.status === "pending")
    .map((connection) => app.users.find((user) => user.id === connection.senderId)?.username)
    .filter(Boolean)
    .slice(0, 8)
    .join(", ") || "none";
  const connectionNames = app.currentUser
    ? app.getAcceptedConnectionIds(app.currentUser.id).map((id) => app.users.find((user) => user.id === id)?.username).filter(Boolean).slice(0, 12).join(", ") || "none"
    : "none";
  const recentPosts = app.posts
    .filter((post) => post.userId === app.currentUser?.id && !post.deletedAt)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 5)
    .map((post) => `- ${post.content.slice(0, 120)}`)
    .join("\n") || "No recent posts.";
  const recentGroupMessages = app.groupMessages
    .filter((message) => app.visibleGroups.some((group) => group.id === message.groupId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12)
    .map((message) => {
      const group = app.visibleGroups.find((item) => item.id === message.groupId);
      const mine = message.senderId === app.currentUser?.id ? "me" : "other";
      return `- ${group?.name ?? "group"} (${mine}): ${message.content.slice(0, 140)}`;
    })
    .join("\n") || "No recent visible group messages.";
  return `User:${app.currentUser?.username ?? "unknown"} Theme:${app.settings.theme} Time:${app.settings.timeFormat ?? "24"} Privacy:${app.currentUser?.privacy ?? "unknown"}\nConnections:${connectionNames}\nIncoming requests:${incomingRequests}\nVisible groups:${groupNames}\nRecent posts:\n${recentPosts}\nRecent visible group chat:\n${recentGroupMessages}`;
};

export const executeAiCommand = async (command: AiCommand, app: AppContextValueForAi): Promise<AiActionResult> => {
  if (!app.currentUser) return { handled: true, content: "Sign in first.", kind: "action" };

  if (command.type === "help") {
    return {
      handled: true,
      kind: "text",
      content: "I can use the same app actions you can: connections, requests, groups, messages, posts, comments, likes, settings, notifications, reminders, scheduled sends, and weekly recaps. App permission rules still apply.",
    };
  }

  if (command.type === "connectUser") {
    const user = resolveUser(app, command.username);
    if (!user) return { handled: true, content: `I could not find @${command.username}.`, kind: "action" };
    const status = app.getConnectionStatus(user.id);
    if (status !== "none") return { handled: true, content: `Connection status with ${user.username}: ${status}.`, kind: "action" };
    app.sendRequest(user.id);
    return { handled: true, content: `Connection request sent to ${user.username}.`, kind: "action" };
  }

  if (command.type === "respondConnection") {
    const incoming = app.connections.filter((connection) => connection.receiverId === app.currentUser.id && connection.status === "pending");
    const request = command.username
      ? incoming.find((connection) => resolveUser(app, command.username!)?.id === connection.senderId)
      : incoming[0];
    if (!request) return { handled: true, content: "I could not find a matching incoming connection request.", kind: "action" };
    const sender = app.users.find((user) => user.id === request.senderId);
    app.respondRequest(request.id, command.accept);
    return { handled: true, content: `${command.accept ? "Accepted" : "Declined"} ${sender?.username ?? "the request"}.`, kind: "action" };
  }

  if (command.type === "removeConnection") {
    const user = resolveUser(app, command.username);
    if (!user) return { handled: true, content: `I could not find @${command.username}.`, kind: "action" };
    if (app.getConnectionStatus(user.id) !== "connected") return { handled: true, content: `${user.username} is not an accepted connection.`, kind: "action" };
    app.deleteConnection(user.id);
    return { handled: true, content: `Removed ${user.username} from connections.`, kind: "action" };
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

  if (command.type === "timeFormat") {
    app.updateTimeFormat(command.format);
    return { handled: true, content: `Time format set to ${command.format}-hour.`, kind: "action" };
  }

  if (command.type === "privacy") {
    const customUsers = command.visibility === "custom" ? resolveUsers(app, command.usernames ?? []).map((user) => user.username) : undefined;
    app.updateUserSettings({ privacy: command.visibility, customUsernames: customUsers ?? app.currentUser.customUsernames });
    return { handled: true, content: `Privacy set to ${command.visibility}.`, kind: "action" };
  }

  if (command.type === "markNotificationsRead") {
    app.markNotificationsRead();
    return { handled: true, content: "Notifications marked as read.", kind: "action" };
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
    const post = latestPost(app.posts, app.currentUser.id, true);
    if (!post) return { handled: true, content: "I could not find one of your posts to edit.", kind: "action" };
    const result = app.updatePost(post.id, {
      content: command.content,
      startTime: command.startTime ?? post.startTime,
      endTime: command.endTime ?? post.endTime,
    });
    return { handled: true, content: result.ok ? "Latest feed post updated." : result.error ?? "Could not edit the post.", kind: "action" };
  }

  if (command.type === "editPostTiming") {
    const post = latestPost(app.posts, app.currentUser.id, true);
    if (!post) return { handled: true, content: "I could not find one of your posts to edit.", kind: "action" };
    const result = app.updatePost(post.id, {
      startTime: command.startTime ?? post.startTime,
      endTime: command.endTime ?? post.endTime,
    });
    return { handled: true, content: result.ok ? "Latest post timing updated." : result.error ?? "Could not edit the timing.", kind: "action" };
  }

  if (command.type === "sendGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const result = await app.addGroupMessage(group.id, command.content);
    return { handled: true, content: result.ok ? `Sent to ${group.name}.` : result.error ?? "Could not send the group update.", kind: "action" };
  }

  if (command.type === "createGroup") {
    const members = resolveUsers(app, command.usernames);
    const result = app.createGroup({ name: command.name, memberIds: members.map((user) => user.id) });
    return { handled: true, content: result.ok ? `Group "${command.name}" created.` : result.error ?? "Could not create the group.", kind: "action" };
  }

  if (command.type === "renameGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const result = app.updateGroupName(group.id, command.name);
    return { handled: true, content: result.ok ? `Renamed ${group.name} to ${command.name}.` : result.error ?? "Could not rename the group.", kind: "action" };
  }

  if (command.type === "addGroupMembers") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const members = resolveUsers(app, command.usernames);
    const result = app.addGroupMembers(group.id, members.map((user) => user.id));
    return { handled: true, content: result.ok ? `Added members to ${group.name}.` : result.error ?? "Could not add members.", kind: "action" };
  }

  if (command.type === "removeGroupMember") {
    const group = resolveGroup(app, command.groupName);
    const user = resolveUser(app, command.username);
    if (!group || !user) return { handled: true, content: "I could not find the group or user.", kind: "action" };
    const result = app.removeGroupMember(group.id, user.id);
    return { handled: true, content: result.ok ? `Removed ${user.username} from ${group.name}.` : result.error ?? "Could not remove the member.", kind: "action" };
  }

  if (command.type === "exitGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const result = app.exitGroup(group.id);
    return { handled: true, content: result.ok ? `Exited ${group.name}.` : result.error ?? "Could not exit the group.", kind: "action" };
  }

  if (command.type === "muteGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    if (app.isGroupMuted(group.id) !== command.muted) app.toggleMuteGroup(group.id);
    return { handled: true, content: `${command.muted ? "Muted" : "Unmuted"} ${group.name}.`, kind: "action" };
  }

  if (command.type === "clearGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    const result = app.clearGroupChat(group.id);
    return { handled: true, content: result.ok ? `Cleared ${group.name}.` : result.error ?? "Could not clear the group chat.", kind: "action" };
  }

  if (command.type === "scheduleGroup") {
    const group = resolveGroup(app, command.groupName);
    if (!group) return { handled: true, content: `I could not find a group named "${command.groupName}".`, kind: "action" };
    if (command.runAt <= Date.now()) return { handled: true, content: "Choose a future time for the scheduled message.", kind: "action" };
    addScheduledAiAction({
      id: `sched_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      type: "sendGroup",
      userId: app.currentUser.id,
      groupId: group.id,
      groupName: group.name,
      content: command.content,
      runAt: command.runAt,
      createdAt: Date.now(),
    });
    return { handled: true, content: `Scheduled for ${group.name} at ${new Date(command.runAt).toLocaleString()}.`, kind: "action" };
  }

  if (command.type === "deleteGroupText") {
    const groups = command.groupName ? [resolveGroup(app, command.groupName)].filter(Boolean) : app.visibleGroups;
    const groupIds = new Set(groups.map((group) => group!.id));
    const needle = command.text.toLowerCase();
    const matches = app.groupMessages.filter((message) =>
      groupIds.has(message.groupId) &&
      message.content.toLowerCase().includes(needle) &&
      !message.deletedFor?.includes(app.currentUser!.id)
    );
    if (matches.length === 0) return { handled: true, content: "I could not find a matching group message.", kind: "action" };
    let deleted = 0;
    for (const message of matches) {
      const result = app.deleteGroupMessage(message.id, command.scope ?? "everyone");
      if (result.ok) deleted += 1;
    }
    return { handled: true, content: `Deleted ${deleted} matching message${deleted === 1 ? "" : "s"}.`, kind: "action" };
  }

  if (command.type === "pinGroupMessage") {
    const message = resolveMessage(app, command.groupName, command.text);
    if (!message) return { handled: true, content: "I could not find a matching message.", kind: "action" };
    const pinned = message.pinnedBy?.includes(app.currentUser.id) ?? false;
    if (pinned !== command.pinned) app.toggleGroupMessagePin(message.id);
    return { handled: true, content: `${command.pinned ? "Pinned" : "Unpinned"} the message.`, kind: "action" };
  }

  if (command.type === "reactGroupMessage") {
    const message = resolveMessage(app, command.groupName, command.text);
    if (!message) return { handled: true, content: "I could not find a matching message.", kind: "action" };
    const result = app.toggleGroupMessageReaction(message.id, command.reaction);
    return { handled: true, content: result.ok ? "Reaction updated." : result.error ?? "Could not react to the message.", kind: "action" };
  }

  if (command.type === "editGroupMessage") {
    const message = resolveMessage(app, command.groupName, command.text, true);
    if (!message) return { handled: true, content: "I could not find one of your matching messages to edit.", kind: "action" };
    const result = await app.updateGroupMessage(message.id, command.content);
    return { handled: true, content: result.ok ? "Message updated." : result.error ?? "Could not update the message.", kind: "action" };
  }

  if (command.type === "commentPost") {
    const post = latestPost(app.visibleFeedPosts.length ? app.visibleFeedPosts : app.posts, app.currentUser.id);
    if (!post) return { handled: true, content: "I could not find a post to comment on.", kind: "action" };
    const result = app.addPostComment(post.id, command.content);
    return { handled: true, content: result.ok ? "Comment posted." : result.error ?? "Could not post the comment.", kind: "action" };
  }

  if (command.type === "deletePost") {
    const post = latestPost(app.posts, app.currentUser.id, true);
    if (!post) return { handled: true, content: "I could not find one of your posts to delete.", kind: "action" };
    app.deletePost(post.id);
    return { handled: true, content: "Latest post deleted.", kind: "action" };
  }

  if (command.type === "likePost") {
    const post = latestPost(app.visibleFeedPosts.length ? app.visibleFeedPosts : app.posts, app.currentUser.id);
    if (!post) return { handled: true, content: "I could not find a post to like.", kind: "action" };
    const result = app.togglePostLike(post.id);
    return { handled: true, content: result.ok ? "Post like updated." : result.error ?? "Could not like the post.", kind: "action" };
  }

  if (command.type === "editComment") {
    const target = latestOwnComment(app.posts, app.currentUser.id);
    if (!target) return { handled: true, content: "I could not find one of your comments to edit.", kind: "action" };
    const result = app.updatePostComment(target.post.id, target.comment.id, command.content);
    return { handled: true, content: result.ok ? "Comment updated." : result.error ?? "Could not update the comment.", kind: "action" };
  }

  if (command.type === "deleteComment") {
    const target = latestOwnComment(app.posts, app.currentUser.id);
    if (!target) return { handled: true, content: "I could not find one of your comments to delete.", kind: "action" };
    const result = app.deletePostComment(target.post.id, target.comment.id);
    return { handled: true, content: result.ok ? "Comment deleted." : result.error ?? "Could not delete the comment.", kind: "action" };
  }

  if (command.type === "reminder") {
    const task = await createLocalReminder(app.currentUser.id, command.content, command.reminderAt);
    return { handled: true, kind: "action", content: `Reminder created for ${new Date(task.reminderAt!).toLocaleString()}.` };
  }

  return { handled: false, content: "" };
};
