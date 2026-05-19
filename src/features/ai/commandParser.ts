import { AI_MENTION, AI_NAME } from "./constants";

export type AiCommand =
  | { type: "theme"; theme: "light" | "dark" }
  | { type: "notifications"; enabled: boolean }
  | { type: "retention"; days: number }
  | { type: "weeklyRecap" }
  | { type: "createPost"; content: string; startTime?: number; endTime?: number }
  | { type: "editPost"; content: string; startTime?: number; endTime?: number }
  | { type: "editPostTiming"; startTime?: number; endTime?: number }
  | { type: "sendGroup"; groupName: string; content: string }
  | { type: "reminder"; content: string }
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
  if (type === "theme" && (record.theme === "light" || record.theme === "dark")) {
    return { type, theme: record.theme };
  }
  if (type === "notifications" && typeof record.enabled === "boolean") {
    return { type, enabled: record.enabled };
  }
  if (type === "retention" && Number.isFinite(Number(record.days))) {
    return { type, days: Number(record.days) };
  }
  if (type === "weeklyRecap") return { type };
  if (type === "help") return { type };
  if (type === "reminder" && typeof record.content === "string") {
    return { type, content: record.content.trim() };
  }
  if (type === "sendGroup" && typeof record.groupName === "string" && typeof record.content === "string") {
    return { type, groupName: record.groupName.trim(), content: record.content.trim() };
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

  const announcementMatch = text.match(/\bpost\s+(?:an\s+)?announcement\s+(?:to|in)\s+(.+?)\s*:\s*([\s\S]+)/i);
  if (announcementMatch?.[1] && announcementMatch?.[2]) {
    return { type: "sendGroup", groupName: announcementMatch[1].trim(), content: announcementMatch[2].trim() };
  }

  const groupMatch = text.match(/\b(?:send|post)\s+(?:a\s+)?(?:group\s+)?(?:update|message)?\s*(?:to|in)\s+(.+?)\s*:\s*([\s\S]+)/i);
  if (groupMatch?.[1] && groupMatch?.[2]) {
    return { type: "sendGroup", groupName: groupMatch[1].trim(), content: groupMatch[2].trim() };
  }

  const groupSayingMatch = text.match(/\b(?:send|post)\s+(?:a\s+)?(?:message|update)\s+(?:to|in)\s+(.+?)\s+(?:saying|that)\s+([\s\S]+)/i);
  if (groupSayingMatch?.[1] && groupSayingMatch?.[2]) {
    return { type: "sendGroup", groupName: groupSayingMatch[1].trim(), content: groupSayingMatch[2].trim() };
  }

  const reminderMatch = text.match(/\b(?:create|set|add)\s+(?:a\s+)?reminder(?:\s+to|\s*:)?\s+([\s\S]+)/i);
  if (reminderMatch?.[1]?.trim()) return { type: "reminder", content: reminderMatch[1].trim() };

  return { type: "chat", prompt: text };
};

export const suggestedCommands = [
  "Weekly recap",
  "Switch theme to dark",
  "Change auto-delete to 14 days",
  "Create post: Finished the sprint planning notes",
  "Send update to Design: I shared the latest task summary",
];
