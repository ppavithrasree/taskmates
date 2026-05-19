import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Mic, Send, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { AI_NAME, AI_STORAGE_KEYS } from "./constants";
import { buildAiContext, executeAiCommand } from "./actions";
import { parseAiCommand, suggestedCommands } from "./commandParser";
import { askGemini, inferAiCommandWithGemini, type AiChatMessage } from "./geminiService";
import { loadGeminiKey } from "./storage";

const makeMessage = (role: AiChatMessage["role"], content: string, kind: AiChatMessage["kind"] = "text"): AiChatMessage => ({
  id: crypto.randomUUID?.() ?? String(Date.now()),
  role,
  content,
  kind,
  createdAt: Date.now(),
});

export const AiChat = memo(({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const app = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(AI_STORAGE_KEYS.chat) ?? "[]") as AiChatMessage[];
    } catch {
      return [];
    }
  });
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    sessionStorage.setItem(AI_STORAGE_KEYS.chat, JSON.stringify(messages.slice(-30)));
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, messages.length, typing]);

  const starter = useMemo(
    () => messages.length === 0
      ? makeMessage("assistant", `Hi, I'm ${AI_NAME}. Ask me for a weekly recap, a group update, or an app action.`)
      : null,
    [messages.length]
  );
  const displayMessages = starter ? [starter, ...messages] : messages;

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || typing) return;
    const now = Date.now();
    if (now - lastSentRef.current < 900) {
      toast.info(`${AI_NAME} is catching up.`);
      return;
    }
    lastSentRef.current = now;
    setInput("");
    const userMessage = makeMessage("user", clean);
    setMessages((items) => [...items, userMessage]);
    setTyping(true);
    try {
      const command = parseAiCommand(clean);
      const action = await executeAiCommand(command, app);
      if (action.handled) {
        setMessages((items) => [...items, makeMessage("assistant", action.content, action.kind)]);
        return;
      }
      const apiKey = await loadGeminiKey(app.currentUser?.id);
      const looksLikeAction = /\b(send|edit|update|create|post|change|fix|correct|switch|remind|reminder|announce|tell)\b/i.test(clean);
      if (apiKey && looksLikeAction) {
        const inferred = await inferAiCommandWithGemini({
          apiKey,
          prompt: clean,
          context: buildAiContext(app),
        });
        if (inferred && inferred.type !== "chat") {
          const inferredAction = await executeAiCommand(inferred, app);
          if (inferredAction.handled) {
            setMessages((items) => [...items, makeMessage("assistant", inferredAction.content, inferredAction.kind)]);
            return;
          }
        }
      }
      if (looksLikeAction && /\b(group|message|post|time|timing)\b/i.test(clean)) {
        setMessages((items) => [...items, makeMessage(
          "assistant",
          "I could not map that to a safe app action. Try naming the group or the post timing clearly, and I will apply it without extra Firebase reads.",
          "action"
        )]);
        return;
      }
      if (!apiKey) {
        setMessages((items) => [...items, makeMessage("assistant", "Add your Gemini API key in Settings to use AI chat responses.", "action")]);
        return;
      }
      const answer = await askGemini({
        apiKey,
        prompt: clean,
        history: messages,
        context: buildAiContext(app),
      });
      setMessages((items) => [...items, makeMessage("assistant", answer)]);
    } catch (error) {
      setMessages((items) => [...items, makeMessage("assistant", error instanceof Error ? error.message : "Something went wrong.", "action")]);
    } finally {
      setTyping(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(86dvh,720px)] w-[calc(100vw-1rem)] max-w-xl flex-col overflow-hidden rounded-lg p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{AI_NAME}</DialogTitle>
              <p className="text-xs text-muted-foreground">Collaboration and productivity assistant</p>
            </div>
          </div>
        </DialogHeader>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4">
          {displayMessages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[84%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-soft",
                  message.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : message.kind === "recap"
                      ? "rounded-bl-md border border-primary/20 bg-primary-soft text-foreground"
                      : "rounded-bl-md border border-border bg-card"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="size-4 text-primary" />
              <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-primary" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card p-3">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {suggestedCommands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => void send(command)}
                className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-smooth hover:text-foreground"
              >
                {command}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex items-end gap-2">
            <Button type="button" size="icon" variant="outline" className="h-11 w-11 shrink-0" aria-label="Voice input coming soon" title="Voice input coming soon">
              <Mic className="size-4" />
            </Button>
            <div className="relative flex-1">
              <Wand2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={`Message ${AI_NAME}`}
                className="max-h-32 min-h-11 resize-none rounded-xl bg-background pl-9 pr-3"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!input.trim() || typing} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
});

AiChat.displayName = "AiChat";
