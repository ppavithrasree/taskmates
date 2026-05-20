import { AI_MENTION, AI_NAME } from "./constants";

export type AiCommand =
  | { type: "connectUser"; username: string }
  | { type: "respondConnection"; username?: string; accept: boolean }
  | { type: "removeConnection"; username: string }
  | { type: "createGroup"; name: string; usernames: string[] }
  | { type: "renameGroup"; groupName: string; name: string }
  | { type: "addGroupMembers"; groupName: string; usernames: string[] }
  | { type: "removeGroupMember"; groupName: string; username: string }
  | { type: "exitGroup"; groupName: string }
  | { type: "muteGroup"; groupName: string; muted: boolean }
  | { type: "clearGroup"; groupName: string }
  | { type: "pinGroupMessage"; groupName?: string; text?: string; pinned: boolean }
  | { type: "reactGroupMessage"; groupName?: string; text?: string; reaction: string }
  | { type: "editGroupMessage"; groupName?: string; text?: string; content: string }
  | { type: "theme"; theme: "light" | "dark" }
  | { type: "notifications"; enabled: boolean }
  | { type: "retention"; days: number }
  | { type: "timeFormat"; format: "12" | "24" }
  | { type: "privacy"; visibility: "public" | "connections" | "custom"; usernames?: string[] }
  | { type: "markNotificationsRead" }
  | { type: "weeklyRecap" }
  | { type: "createPost"; content: string; startTime?: number; endTime?: number }
  | { type: "editPost"; content: string; startTime?: number; endTime?: number }
  | { type: "editPostTiming"; startTime?: number; endTime?: number }
  | { type: "deletePost"; postHint?: string }
  | { type: "likePost"; postHint?: string }
  | { type: "sendGroup"; groupName: string; content: string }
  | { type: "scheduleGroup"; groupName: string; content: string; runAt: number }
  | { type: "deleteGroupText"; text: string; groupName?: string; scope?: "me" | "everyone" }
  | { type: "commentPost"; content: string; postHint?: string }
  | { type: "editComment"; content: string; commentHint?: string; postHint?: string }
  | { type: "deleteComment"; commentHint?: string; postHint?: string }
  | { type: "reminder"; content: string; reminderAt?: number }
  | { type: "help" }
  | { type: "chat"; prompt: string };

const stripAssistantMention = (input: string) =>
  input
    .replace(new RegExp(`@${AI_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), "")
    .replace(/@mateai/gi, "")
    .replace(new RegExp(AI_MENTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
    .trim();

const timeForToday = (hourText: string, minuteText = "0", period?: string) => {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (period) {
    const cleanPeriod = period.toLowerCase();
    hour %= 12;
    if (cleanPeriod === "pm") hour += 12;
  }
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

const extractSingleTime = (input: string) => {
  const match = input.match(/\b(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;
  let runAt = timeForToday(match[1], match[2] ?? "0", match[3]);
  if (runAt <= Date.now()) runAt += 24 * 60 * 60 * 1000;
  return { runAt, text: input.replace(match[0], "").replace(/\s{2,}/g, " ").trim() };
};

const timeFromParts = (parts: RegExpMatchArray, fallbackPeriod?: string) => {
  if (/^(current|now)$/i.test(parts[1])) return Date.now();
  return timeForToday(parts[2], parts[3] ?? "0", parts[4] || fallbackPeriod);
};

const extractTimeRange = (input: string) => {
  const timeToken = String.raw`(?:current|now|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)`;
  const match = input.match(new RegExp(String.raw`\b(?:from\s+)?(${timeToken})\s+(?:to|-|until|till)\s+(${timeToken})\b`, "i"));
  if (!match) return null;
  const startParts = match[1].match(/^(current|now|(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)$/i);
  const endParts = match[2].match(/^(current|now|(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)$/i);
  if (!startParts || !endParts) return null;
  const startTime = timeFromParts(startParts, endParts[4]);
  let endTime = timeFromParts(endParts, startParts[4]);
  if (endTime <= startTime) endTime += 24 * 60 * 60 * 1000;
  return {
    startTime,
    endTime,
    text: input.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
  };
};

export const coerceAiCommand = (value: unknown): AiCommand | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = String(record.type ?? "");
  const usernames = Array.isArray(record.usernames) ? record.usernames.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  if (type === "connectUser" && typeof record.username === "string") return { type, username: record.username.trim() };
  if (type === "respondConnection" && typeof record.accept === "boolean") {
    return { type, accept: record.accept, username: typeof record.username === "string" ? record.username.trim() : undefined };
  }
  if (type === "removeConnection" && typeof record.username === "string") return { type, username: record.username.trim() };
  if (type === "createGroup" && typeof record.name === "string") return { type, name: record.name.trim(), usernames };
  if (type === "renameGroup" && typeof record.groupName === "string" && typeof record.name === "string") {
    return { type, groupName: record.groupName.trim(), name: record.name.trim() };
  }
  if (type === "addGroupMembers" && typeof record.groupName === "string") return { type, groupName: record.groupName.trim(), usernames };
  if (type === "removeGroupMember" && typeof record.groupName === "string" && typeof record.username === "string") {
    return { type, groupName: record.groupName.trim(), username: record.username.trim() };
  }
  if (type === "exitGroup" && typeof record.groupName === "string") return { type, groupName: record.groupName.trim() };
  if (type === "muteGroup" && typeof record.groupName === "string" && typeof record.muted === "boolean") {
    return { type, groupName: record.groupName.trim(), muted: record.muted };
  }
  if (type === "clearGroup" && typeof record.groupName === "string") return { type, groupName: record.groupName.trim() };
  if (type === "pinGroupMessage" && typeof record.pinned === "boolean") {
    return {
      type,
      pinned: record.pinned,
      groupName: typeof record.groupName === "string" ? record.groupName.trim() : undefined,
      text: typeof record.text === "string" ? record.text.trim() : undefined,
    };
  }
  if (type === "reactGroupMessage" && typeof record.reaction === "string") {
    return {
      type,
      reaction: record.reaction.trim(),
      groupName: typeof record.groupName === "string" ? record.groupName.trim() : undefined,
      text: typeof record.text === "string" ? record.text.trim() : undefined,
    };
  }
  if (type === "editGroupMessage" && typeof record.content === "string") {
    return {
      type,
      content: record.content.trim(),
      groupName: typeof record.groupName === "string" ? record.groupName.trim() : undefined,
      text: typeof record.text === "string" ? record.text.trim() : undefined,
    };
  }
  if (type === "theme" && (record.theme === "light" || record.theme === "dark")) {
    return { type, theme: record.theme };
  }
  if (type === "notifications" && typeof record.enabled === "boolean") {
    return { type, enabled: record.enabled };
  }
  if (type === "retention" && Number.isFinite(Number(record.days))) {
    return { type, days: Number(record.days) };
  }
  if (type === "timeFormat" && (record.format === "12" || record.format === "24")) return { type, format: record.format };
  if (type === "privacy" && (record.visibility === "public" || record.visibility === "connections" || record.visibility === "custom")) {
    return { type, visibility: record.visibility, usernames };
  }
  if (type === "markNotificationsRead") return { type };
  if (type === "weeklyRecap") return { type };
  if (type === "help") return { type };
  if (type === "reminder" && typeof record.content === "string") {
    return {
      type,
      content: record.content.trim(),
      reminderAt: Number.isFinite(Number(record.reminderAt)) ? Number(record.reminderAt) : undefined,
    };
  }
  if (type === "sendGroup" && typeof record.groupName === "string" && typeof record.content === "string") {
    return { type, groupName: record.groupName.trim(), content: record.content.trim() };
  }
  if (type === "scheduleGroup" && typeof record.groupName === "string" && typeof record.content === "string" && Number.isFinite(Number(record.runAt))) {
    return { type, groupName: record.groupName.trim(), content: record.content.trim(), runAt: Number(record.runAt) };
  }
  if (type === "deleteGroupText" && typeof record.text === "string") {
    return {
      type,
      text: record.text.trim(),
      groupName: typeof record.groupName === "string" ? record.groupName.trim() : undefined,
      scope: record.scope === "me" ? "me" : "everyone",
    };
  }
  if (type === "commentPost" && typeof record.content === "string") {
    return {
      type,
      content: record.content.trim(),
      postHint: typeof record.postHint === "string" ? record.postHint.trim() : undefined,
    };
  }
  if (type === "editComment" && typeof record.content === "string") {
    return {
      type,
      content: record.content.trim(),
      commentHint: typeof record.commentHint === "string" ? record.commentHint.trim() : undefined,
      postHint: typeof record.postHint === "string" ? record.postHint.trim() : undefined,
    };
  }
  if (type === "deleteComment") {
    return {
      type,
      commentHint: typeof record.commentHint === "string" ? record.commentHint.trim() : undefined,
      postHint: typeof record.postHint === "string" ? record.postHint.trim() : undefined,
    };
  }
  if ((type === "createPost" || type === "editPost") && typeof record.content === "string") {
    return {
      type,
      content: record.content.trim(),
      startTime: Number.isFinite(Number(record.startTime)) ? Number(record.startTime) : undefined,
      endTime: Number.isFinite(Number(record.endTime)) ? Number(record.endTime) : undefined,
    };
  }
  if (type === "editPostTiming") {
    return {
      type,
      startTime: Number.isFinite(Number(record.startTime)) ? Number(record.startTime) : undefined,
      endTime: Number.isFinite(Number(record.endTime)) ? Number(record.endTime) : undefined,
    };
  }
  if (type === "deletePost") return { type, postHint: typeof record.postHint === "string" ? record.postHint.trim() : undefined };
  if (type === "likePost") return { type, postHint: typeof record.postHint === "string" ? record.postHint.trim() : undefined };
  return null;
};

const cleanPostContent = (input: string) =>
  input
    .replace(/^(?:saying|that|about|as|:)\s+/i, "")
    .replace(/\b(?:for|with)\s+(?:content|caption)\s*:?\s*/i, "")
    .trim();

export const parseAiCommand = (input: string): AiCommand => {
  const text = stripAssistantMention(input);
  const lower = text.toLowerCase();

  if (/^(help|what can you do)/i.test(text)) return { type: "help" };
  const connectMatch = text.match(/\b(?:connect|add friend|send (?:a )?connection request)\s+(?:to|with)?\s*@?([\w.-]+)/i);
  if (connectMatch?.[1]) return { type: "connectUser", username: connectMatch[1] };
  const acceptMatch = text.match(/\b(accept|approve|reject|decline)\s+(?:connection\s+)?(?:request\s+)?(?:from\s+)?@?([\w.-]+)?/i);
  if (acceptMatch) return { type: "respondConnection", accept: /accept|approve/i.test(acceptMatch[1]), username: acceptMatch[2] };
  const removeConnectionMatch = /\bfrom\s+(?:group\s+)?/i.test(text)
    ? null
    : text.match(/\b(?:remove|delete|unfriend)\s+(?:connection|friend)?\s*@?([\w.-]+)/i);
  if (removeConnectionMatch?.[1]) return { type: "removeConnection", username: removeConnectionMatch[1] };
  if (/\bweekly\b.*\b(recap|summary|productivity|analytics)\b/i.test(text) || /\b(recap|summarize my week)\b/i.test(text)) {
    return { type: "weeklyRecap" };
  }

  const themeMatch = lower.match(/\b(?:switch|change|set)\s+(?:theme\s+)?(?:to\s+)?(dark|light)\b/);
  if (themeMatch) return { type: "theme", theme: themeMatch[1] as "light" | "dark" };

  const notificationTarget = /\b(notifications?|alerts?|push(?:es)?|pings?)\b/i.test(text);
  if (notificationTarget && /\b(?:off|mute|disable|stop|silent|silence|pause|turn\s+off|shut\s+off)\b/i.test(text)) {
    return { type: "notifications", enabled: false };
  }
  if (notificationTarget && /\b(?:on|unmute|enable|start|resume|allow|turn\s+on)\b/i.test(text)) {
    return { type: "notifications", enabled: true };
  }

  const retentionMatch = lower.match(/\b(?:auto[- ]?delete|retention).*?(\d{1,2})\s*days?\b/);
  if (retentionMatch) return { type: "retention", days: Number(retentionMatch[1]) };

  const timeFormatMatch = lower.match(/\b(?:time\s*format|clock)\s*(?:to|as)?\s*(12|24)\b/);
  if (timeFormatMatch) return { type: "timeFormat", format: timeFormatMatch[1] as "12" | "24" };

  if (/\bmark\b.*\bnotifications?\b.*\bread\b/i.test(text)) return { type: "markNotificationsRead" };

  const groupCreateMatch = text.match(/\bcreate\s+(?:a\s+)?group\s+(.+?)\s+(?:with|including)\s+([\s\S]+)/i);
  if (groupCreateMatch?.[1] && groupCreateMatch?.[2]) {
    return { type: "createGroup", name: groupCreateMatch[1].trim(), usernames: groupCreateMatch[2].split(/,|and/i).map((item) => item.replace(/@/g, "").trim()).filter(Boolean) };
  }

  const timingEditRange = /\b(?:fix|edit|update|change|correct)\b.*\b(?:time|timing|start|end|range)\b/i.test(text)
    ? extractTimeRange(text)
    : null;
  if (timingEditRange) return { type: "editPostTiming", startTime: timingEditRange.startTime, endTime: timingEditRange.endTime };

  const editPostMatch = text.match(/\b(?:edit|update|change)\s+(?:my\s+)?(?:latest|last|recent)?\s*(?:feed\s+)?post(?:\s+(?:to|as|saying)|\s*:)?\s+([\s\S]+)/i);
  if (editPostMatch?.[1]?.trim()) {
    const range = extractTimeRange(editPostMatch[1]);
    const content = cleanPostContent(range?.text ?? editPostMatch[1]);
    if (!content && range) return { type: "editPostTiming", startTime: range.startTime, endTime: range.endTime };
    return { type: "editPost", content, startTime: range?.startTime, endTime: range?.endTime };
  }

  const postMatch = text.match(/\b(?:create|write|publish|add)\s+(?:a\s+)?(?:feed\s+)?post(?:\s+saying|\s+that|\s*:)?\s+([\s\S]+)/i);
  if (postMatch?.[1]?.trim()) {
    const range = extractTimeRange(postMatch[1]);
    const content = cleanPostContent(range?.text ?? postMatch[1]);
    return { type: "createPost", content, startTime: range?.startTime, endTime: range?.endTime };
  }

  if (/\b(?:delete|remove)\s+(?:my\s+)?(?:latest|last|recent)?\s*(?:feed\s+)?post\b/i.test(text)) {
    return { type: "deletePost", postHint: "latest" };
  }

  if (/\b(?:like|unlike)\s+(?:the\s+)?(?:latest|last|recent)?\s*(?:feed\s+)?post\b/i.test(text)) {
    return { type: "likePost", postHint: "latest" };
  }

  const renameGroupMatch = text.match(/\b(?:rename|change)\s+(?:group\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (renameGroupMatch?.[1] && renameGroupMatch?.[2] && /\bgroup\b/i.test(text)) {
    return { type: "renameGroup", groupName: renameGroupMatch[1].trim(), name: renameGroupMatch[2].trim() };
  }

  const addMembersMatch = text.match(/\badd\s+(.+?)\s+to\s+(?:group\s+)?(.+)$/i);
  if (addMembersMatch?.[1] && addMembersMatch?.[2]) {
    return {
      type: "addGroupMembers",
      groupName: addMembersMatch[2].trim(),
      usernames: addMembersMatch[1].split(/,|and/i).map((item) => item.replace(/@/g, "").trim()).filter(Boolean),
    };
  }

  const removeMemberMatch = text.match(/\bremove\s+@?([\w.-]+)\s+from\s+(?:group\s+)?(.+)$/i);
  if (removeMemberMatch?.[1] && removeMemberMatch?.[2]) {
    return { type: "removeGroupMember", username: removeMemberMatch[1].trim(), groupName: removeMemberMatch[2].trim() };
  }

  const exitGroupMatch = text.match(/\b(?:exit|leave)\s+(?:group\s+)?(.+)$/i);
  if (exitGroupMatch?.[1]) return { type: "exitGroup", groupName: exitGroupMatch[1].trim() };

  const muteGroupMatch = text.match(/\b(mute|unmute)\s+(?:group\s+)?(.+)$/i);
  if (muteGroupMatch?.[1] && muteGroupMatch?.[2]) {
    return { type: "muteGroup", groupName: muteGroupMatch[2].trim(), muted: muteGroupMatch[1].toLowerCase() === "mute" };
  }

  const clearGroupMatch = text.match(/\b(?:clear|delete)\s+(?:all\s+)?(?:chat|messages)\s+(?:in|from)\s+(?:group\s+)?(.+)$/i);
  if (clearGroupMatch?.[1]) return { type: "clearGroup", groupName: clearGroupMatch[1].trim() };

  const announcementMatch = text.match(/\bpost\s+(?:an\s+)?announcement\s+(?:to|in)\s+(.+?)\s*:\s*([\s\S]+)/i);
  if (announcementMatch?.[1] && announcementMatch?.[2]) {
    const schedule = extractSingleTime(announcementMatch[2]);
    if (schedule) return { type: "scheduleGroup", groupName: announcementMatch[1].trim(), content: schedule.text, runAt: schedule.runAt };
    return { type: "sendGroup", groupName: announcementMatch[1].trim(), content: announcementMatch[2].trim() };
  }

  const groupMatch = text.match(/\b(?:send|post)\s+(?:a\s+)?(?:group\s+)?(?:update|message)?\s*(?:to|in)\s+(.+?)\s*:\s*([\s\S]+)/i);
  if (groupMatch?.[1] && groupMatch?.[2]) {
    const schedule = extractSingleTime(groupMatch[2]);
    if (schedule) return { type: "scheduleGroup", groupName: groupMatch[1].trim(), content: schedule.text, runAt: schedule.runAt };
    return { type: "sendGroup", groupName: groupMatch[1].trim(), content: groupMatch[2].trim() };
  }

  const groupSayingMatch = text.match(/\b(?:send|post)\s+(?:a\s+)?(?:message|update)\s+(?:to|in)\s+(.+?)\s+(?:saying|that)\s+([\s\S]+)/i);
  if (groupSayingMatch?.[1] && groupSayingMatch?.[2]) {
    const schedule = extractSingleTime(groupSayingMatch[2]);
    if (schedule) return { type: "scheduleGroup", groupName: groupSayingMatch[1].trim(), content: schedule.text, runAt: schedule.runAt };
    return { type: "sendGroup", groupName: groupSayingMatch[1].trim(), content: groupSayingMatch[2].trim() };
  }

  const deleteGroupTextMatch = text.match(/\bdelete\s+(?:the\s+)?(?:text\s+)?message(?:s)?\s+(?:containing|with|saying|that says|:)\s*["']?(.+?)["']?(?:\s+(?:from|in)\s+(.+))?$/i);
  if (deleteGroupTextMatch?.[1]?.trim()) {
    return {
      type: "deleteGroupText",
      text: deleteGroupTextMatch[1].trim(),
      groupName: deleteGroupTextMatch[2]?.trim(),
      scope: /\b(for me|only me|my side)\b/i.test(text) ? "me" : "everyone",
    };
  }

  const commentMatch = text.match(/\b(?:comment|reply)\s+(?:on|to)\s+(?:the\s+)?(?:(latest|recent|last)\s+)?(?:post)?(?:\s+(?:about|with|saying|that)|\s*:)?\s+([\s\S]+)/i);
  if (commentMatch?.[2]?.trim()) {
    return { type: "commentPost", content: commentMatch[2].trim(), postHint: commentMatch[1]?.trim() };
  }

  const editCommentMatch = text.match(/\bedit\s+(?:my\s+)?(?:latest|last|recent)?\s*comment(?:\s+(?:to|as)|\s*:)\s+([\s\S]+)/i);
  if (editCommentMatch?.[1]?.trim()) return { type: "editComment", content: editCommentMatch[1].trim(), commentHint: "latest" };

  if (/\b(?:delete|remove)\s+(?:my\s+)?(?:latest|last|recent)?\s*comment\b/i.test(text)) {
    return { type: "deleteComment", commentHint: "latest" };
  }

  const reminderMatch = text.match(/\b(?:create|set|add)\s+(?:a\s+)?(?:task|reminder|remainder)(?:\s+to|\s*:)?\s+([\s\S]+)/i);
  if (reminderMatch?.[1]?.trim()) {
    const scheduled = extractSingleTime(reminderMatch[1]);
    return {
      type: "reminder",
      content: (scheduled?.text ?? reminderMatch[1]).replace(/\bwith\s+(?:a\s+)?(?:reminder|remainder)\b/i, "").replace(/\bto\s+/i, "").trim(),
      reminderAt: scheduled?.runAt,
    };
  }

  return { type: "chat", prompt: text };
};

export const suggestedCommands = [
  "Weekly recap",
  "Switch theme to dark",
  "Change auto-delete to 14 days",
  "Create post: Finished the sprint planning notes",
  "Send update to Design: I shared the latest task summary",
  "Comment on latest post: Great progress",
];
