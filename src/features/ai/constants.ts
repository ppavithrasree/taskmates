export const AI_NAME = "TaskMate AI";
export const AI_MENTION = "@TaskMate AI";
export const AI_MODEL = "gemini-2.5-flash";

export const AI_STORAGE_KEYS = {
  enabled: "taskmates_ai_enabled_v1",
  key: "taskmates_ai_gemini_key_v1",
  processedMentions: "taskmates_ai_processed_mentions_v1",
  chat: "taskmates_ai_chat_session_v1",
  buttonPosition: "taskmates_ai_button_position_v1",
};

export const AI_SYSTEM_PROMPT = `
You are TaskMate AI, the collaboration and productivity assistant inside TaskMates.
Be concise, practical, warm, and action-oriented.
You can help users write feed posts, send group updates, summarize weekly productivity, and explain app commands.
When an app action is needed, prefer a clear confirmation-style response. Never claim access to private data that was not provided in context.
`;
