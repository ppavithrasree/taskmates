import { AI_MODEL, AI_SYSTEM_PROMPT } from "./constants";
import { coerceAiCommand, type AiCommand } from "./commandParser";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  kind?: "text" | "recap" | "action";
}

const endpointFor = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

export const askGemini = async ({
  apiKey,
  prompt,
  history,
  context,
}: {
  apiKey: string;
  prompt: string;
  history?: AiChatMessage[];
  context?: string;
}) => {
  const recent = (history ?? []).slice(-14).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content.slice(0, 900) }],
  }));

  const response = await fetch(endpointFor(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      contents: [
        ...recent,
        {
          role: "user",
          parts: [{ text: `${context ? `TaskMates context:\n${context}\n\n` : ""}${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 520,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || "Gemini request failed.");
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || "I could not generate a response.";
};

export const inferAiCommandWithGemini = async ({
  apiKey,
  prompt,
  context,
}: {
  apiKey: string;
  prompt: string;
  context: string;
}): Promise<AiCommand | null> => {
  const now = Date.now();
  const response = await fetch(endpointFor(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            "Convert the user's TaskMates request into one JSON object only.",
            "Allowed action types and fields:",
            '{"type":"connectUser","username":string}',
            '{"type":"respondConnection","username"?:string,"accept":boolean}',
            '{"type":"removeConnection","username":string}',
            '{"type":"createGroup","name":string,"usernames":string[]}',
            '{"type":"renameGroup","groupName":string,"name":string}',
            '{"type":"addGroupMembers","groupName":string,"usernames":string[]}',
            '{"type":"removeGroupMember","groupName":string,"username":string}',
            '{"type":"exitGroup","groupName":string}',
            '{"type":"muteGroup","groupName":string,"muted":boolean}',
            '{"type":"clearGroup","groupName":string}',
            '{"type":"pinGroupMessage","groupName"?:string,"text"?:string,"pinned":boolean}',
            '{"type":"reactGroupMessage","groupName"?:string,"text"?:string,"reaction":string}',
            '{"type":"editGroupMessage","groupName"?:string,"text"?:string,"content":string}',
            '{"type":"theme","theme":"light|dark"}',
            '{"type":"notifications","enabled":boolean}',
            '{"type":"retention","days":number}',
            '{"type":"timeFormat","format":"12|24"}',
            '{"type":"privacy","visibility":"public|connections|custom","usernames"?:string[]}',
            '{"type":"markNotificationsRead"}',
            '{"type":"weeklyRecap"}',
            '{"type":"createPost","content":string,"startTime"?:number,"endTime"?:number}',
            '{"type":"editPost","content":string,"startTime"?:number,"endTime"?:number}',
            '{"type":"editPostTiming","startTime"?:number,"endTime"?:number}',
            '{"type":"deletePost","postHint"?:string}',
            '{"type":"likePost","postHint"?:string}',
            '{"type":"sendGroup","groupName":string,"content":string}',
            '{"type":"scheduleGroup","groupName":string,"content":string,"runAt":number}',
            '{"type":"deleteGroupText","text":string,"groupName"?:string,"scope"?: "me|everyone"}',
            '{"type":"commentPost","content":string,"postHint"?:string}',
            '{"type":"editComment","content":string,"commentHint"?:string,"postHint"?:string}',
            '{"type":"deleteComment","commentHint"?:string,"postHint"?:string}',
            '{"type":"reminder","content":string,"reminderAt"?:number}',
            '{"type":"help"}',
            '{"type":"chat","prompt":string}',
            "Use Unix epoch milliseconds for times. If a time says today, base it on currentTimeMs.",
            "Use only visible group names and known usernames from context. If unsure, return chat.",
            "Keep fields minimal.",
          ].join("\n"),
        }],
      },
      contents: [{
        role: "user",
        parts: [{
          text: `currentTimeMs=${now}\n${context}\n\nUser request:\n${prompt}`,
        }],
      }],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 220,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) return null;
  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) return null;
  try {
    return coerceAiCommand(JSON.parse(raw));
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return coerceAiCommand(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
};
