export const AI_NAME = "TaskMate AI";
export const AI_MENTION = "@TaskMate AI";
export const AI_MODEL = "gemini-2.5-flash";

export const AI_STORAGE_KEYS = {
  enabled: "taskmates_ai_enabled_v1",
  key: "taskmates_ai_gemini_key_v1",
  processedMentions: "taskmates_ai_processed_mentions_v1",
  chat: "taskmates_ai_chat_local_v1",
  buttonPosition: "taskmates_ai_button_position_v1",
  scheduledActions: "taskmates_ai_scheduled_actions_v1",
};

export const AI_SYSTEM_PROMPT = `
You are TaskMate AI, the collaboration and productivity assistant inside TaskMates.
Be concise, practical, warm, and action-oriented. Use short answers unless the user asks for detail.
You can work with the app context provided: connections, requests, feed posts, comments, groups, group messages, settings, notifications, reminders, scheduled group sends, and weekly recaps.
When a real app action is needed, prefer the available command/action path and confirm only what happened. Never claim access to data or screens that are not in context.
`;
