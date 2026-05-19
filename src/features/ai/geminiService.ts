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
  const recent = (history ?? []).slice(-8).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
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
        maxOutputTokens: 700,
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
            "Convert the user's TaskMates request into exactly one JSON object and no prose.",
            "Allowed types:",
            '{"type":"theme","theme":"light|dark"}',
            '{"type":"notifications","enabled":boolean}',
            '{"type":"retention","days":number}',
            '{"type":"weeklyRecap"}',
            '{"type":"createPost","content":string,"startTime"?:number,"endTime"?:number}',
            '{"type":"editPost","content":string,"startTime"?:number,"endTime"?:number}',
            '{"type":"editPostTiming","startTime"?:number,"endTime"?:number}',
            '{"type":"sendGroup","groupName":string,"content":string}',
            '{"type":"reminder","content":string}',
            '{"type":"help"}',
            '{"type":"chat","prompt":string}',
            "Use Unix epoch milliseconds for times. If a time says today, base it on currentTimeMs.",
            "Never invent a group name not present in context.",
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
