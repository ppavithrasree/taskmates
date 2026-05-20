import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Info, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const chatKeyFor = (userId?: string | null) => `${AI_STORAGE_KEYS.chat}:${userId ?? "guest"}`;

const capabilities = [
  "Understands natural requests like create a group with Gautam or message Design at 6 pm.",
  "Manages friends, requests, groups, members, group messages, reactions, pins, and cleanup.",
  "Creates and updates posts, comments, likes, reminders, scheduled messages, and weekly recaps.",
  "Changes theme, time format, privacy, notifications, and auto-delete settings.",
  "Uses your signed-in account and recent app context so actions match what you can do in TaskMates.",
];

export const AiChat = memo(({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const app = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(chatKeyFor(app.currentUser?.id)) ?? "[]") as AiChatMessage[];
    } catch {
      return [];
    }
  });
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSentRef = useRef(0);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    try {
      skipNextSaveRef.current = true;
      const saved = JSON.parse(localStorage.getItem(chatKeyFor(app.currentUser?.id)) ?? "[]") as AiChatMessage[];
      setMessages(saved);
    } catch {
      skipNextSaveRef.current = true;
      setMessages([]);
    }
  }, [app.currentUser?.id]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    localStorage.setItem(chatKeyFor(app.currentUser?.id), JSON.stringify(messages.slice(-60)));
  }, [app.currentUser?.id, messages]);

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
      ? makeMessage("assistant", `Hi, I'm ${AI_NAME}. Tell me what you want done in plain language: groups, messages, posts, reminders, settings, or a weekly recap.`)
      : null,
    [messages.length]
  );
  const displayMessages = starter ? [starter, ...messages] : messages;

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(chatKeyFor(app.currentUser?.id));
    toast.success("AI chat cleared.");
  };

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
      const looksLikeAction = /\b(send|schedule|edit|update|create|post|comment|reply|delete|remove|change|fix|correct|switch|remind|reminder|announce|tell|connect|friend|accept|reject|decline|group|member|mute|unmute|leave|exit|pin|react|like|unlike|privacy|notification|read)\b/i.test(clean);
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
      if (looksLikeAction && /\b(group|message|post|time|timing|connection|friend|request|member|comment|notification|privacy)\b/i.test(clean)) {
        setMessages((items) => [...items, makeMessage(
          "assistant",
          "I understand this is an app action, but I need one missing detail to finish it. Add the group/user name, message text, post/comment hint, or time and I will do it.",
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
        history: messages.slice(-14),
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
              <p className="text-xs text-muted-foreground">Plain-language control for TaskMates</p>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" aria-label="What TaskMate AI can do">
                  <Info className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-2">
                  <p className="text-sm font-black">What I can do</p>
                  <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                    {capabilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0 text-destructive hover:text-destructive" aria-label="Delete AI chat">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete AI chat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears the locally stored conversation for this account. App posts, groups, and messages are not changed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete chat
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
            <div className="relative flex-1">
              <Wand2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={`Message ${AI_NAME}`}
                rows={3}
                className="max-h-40 min-h-24 resize-y rounded-xl bg-background pl-9 pr-3"
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
