import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Info,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  UserPlus,
  Users,
  FileText,
  Clock,
  Settings,
  BarChart3,
  ChevronRight,
  Search,
  ArrowLeft,
  X
} from "lucide-react";
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

const PROMPT_CATEGORIES = [
  {
    title: "Friends & Connections",
    icon: <UserPlus className="size-5 text-indigo-500" />,
    description: "Manage your friends list, request connections, and respond to incoming requests.",
    items: [
      {
        name: "Add/Connect Friend",
        description: "Send a connection request to any registered user by their username.",
        examples: ["connect with @Gautam", "add friend sam", "send connection request to alex"],
      },
      {
        name: "Respond to Request",
        description: "Accept or decline pending connection requests.",
        examples: ["accept request from @alex", "approve request from gautam", "decline request", "reject connection request from sam"],
      },
      {
        name: "Remove Connection",
        description: "Disconnect or unfriend a user.",
        examples: ["unfriend @alex", "remove connection with sam", "delete friend gautam"],
      },
    ],
  },
  {
    title: "Groups & Messaging",
    icon: <Users className="size-5 text-emerald-500" />,
    description: "Create groups, manage members, send, schedule, react to, and pin group chat messages.",
    items: [
      {
        name: "Create Group",
        description: "Start a group chat with friends.",
        examples: ["create group Design with Gautam and Alex", "make group Engineers including sam, bob", "create group with gautam"],
      },
      {
        name: "Rename Group",
        description: "Change the name of a group.",
        examples: ["rename group Design to Product Design", "change group Engineers to Devs"],
      },
      {
        name: "Add/Remove Members",
        description: "Add or remove members from group chats.",
        examples: ["add gautam and alex to Design", "add sam to group Engineers", "remove gautam from Design", "remove @alex from group Engineers"],
      },
      {
        name: "Send Group Message",
        description: "Send a text message directly to a group chat.",
        examples: ["send message to Design: I shared the latest task summary", "post group update to Engineers: sprint starting now"],
      },
      {
        name: "Schedule Message",
        description: "Schedule a group message to be sent at a specific future time.",
        examples: ["send group update to Design: hello team at 6 pm", "post message to Engineers: start build by 9:30 am", "schedule group update to marketing: launch tomorrow at 10 am"],
      },
      {
        name: "Delete Messages",
        description: "Delete messages containing specific text from a group (or for everyone).",
        examples: ["delete message containing 'hello team' from Design", "delete message with 'build error'", "delete message saying 'test' for me"],
      },
      {
        name: "Pin & Reactions",
        description: "Pin/unpin messages or add emoji reactions based on matching text.",
        examples: ["pin message in Design containing 'sprint planning'", "unpin message saying 'hello'", "react to message containing 'sprint planning' in Design with 👍", "react to message saying 'hello' with ❤️"],
      },
      {
        name: "Edit Message",
        description: "Edit your sent message matching specific text.",
        examples: ["edit message in Design containing 'task summary' to 'revised task summary'", "edit message saying 'hi' to 'hello'"],
      },
      {
        name: "Group Settings",
        description: "Mute notifications, leave a group, or clear a group chat history.",
        examples: ["mute group Design", "unmute group Engineers", "leave group Design", "clear chat in Design", "delete all messages from group Engineers"],
      },
    ],
  },
  {
    title: "Feed Posts & Comments",
    icon: <FileText className="size-5 text-amber-500" />,
    description: "Publish status updates with active times, write comments, like posts, and manage updates.",
    items: [
      {
        name: "Create Feed Post",
        description: "Publish a status update, optionally with start/end time duration.",
        examples: ["create a feed post saying: Working on layout design", "publish post from 9 am to 5 pm saying: coding frontend", "create post saying: lunch break from current to 1:30 pm"],
      },
      {
        name: "Edit Post/Timing",
        description: "Modify your latest feed post content or duration.",
        examples: ["edit my latest feed post to: updated status report", "edit post to: debugging build from 2 pm to 4 pm", "update timing of post to: from 10 am to 12 pm", "fix post time from 1 pm to 3 pm"],
      },
      {
        name: "Delete/Like Posts",
        description: "Delete your latest feed post or like/unlike other updates in the feed.",
        examples: ["delete my latest feed post", "remove recent post", "like the latest feed post", "unlike the recent post"],
      },
      {
        name: "Manage Comments",
        description: "Write comments on the latest post, or edit/delete your latest comment.",
        examples: ["comment on latest post: Great progress", "reply to recent post saying: congratulations", "edit my latest comment to: updated thought", "delete my latest comment"],
      },
    ],
  },
  {
    title: "Reminders & Tasks",
    icon: <Clock className="size-5 text-sky-500" />,
    description: "Schedule personal reminder tasks that trigger local app notifications.",
    items: [
      {
        name: "Set Reminders",
        description: "Create a task with a specified target reminder time.",
        examples: ["create a task to buy groceries at 6:30 pm", "set reminder to review code at 5 pm", "add reminder call mom at 10 am"],
      },
    ],
  },
  {
    title: "App Settings & Configuration",
    icon: <Settings className="size-5 text-pink-500" />,
    description: "Modify app themes, configure notifications, adjust post auto-deletion (retention), change time formats, and manage privacy.",
    items: [
      {
        name: "Theme & Time Format",
        description: "Switch application theme or clock hour-display format.",
        examples: ["switch theme to dark", "change theme to light", "change clock to 12", "set time format to 24"],
      },
      {
        name: "Mute Notifications",
        description: "Enable or mute push notifications and alerts.",
        examples: ["turn off notifications", "mute alerts", "enable notifications"],
      },
      {
        name: "Post Retention",
        description: "Set the post auto-deletion duration (in days).",
        examples: ["change auto-delete to 14 days", "set retention to 7 days"],
      },
      {
        name: "Privacy & Visibility",
        description: "Configure who can view your posts (Public, Connections, or Custom).",
        examples: ["set privacy to connections", "set visibility to custom with gautam, alex", "change privacy to public"],
      },
      {
        name: "Clear Notifications",
        description: "Mark all app notifications as read.",
        examples: ["mark notifications as read"],
      },
    ],
  },
  {
    title: "Analytics & Recaps",
    icon: <BarChart3 className="size-5 text-violet-500" />,
    description: "Generate summary and activity productivity recaps for your work.",
    items: [
      {
        name: "Weekly Recap",
        description: "Get a comprehensive recap of your week's posts, group messages, and productivity stats.",
        examples: ["weekly recap", "summarize my week", "weekly productivity summary"],
      },
    ],
  },
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
  const [showInfo, setShowInfo] = useState(false);
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSentRef = useRef(0);
  const skipNextSaveRef = useRef(false);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const matches: { categoryTitle: string; name: string; description: string; examples: string[] }[] = [];
    PROMPT_CATEGORIES.forEach((cat) => {
      cat.items.forEach((item) => {
        if (
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.examples.some((ex) => ex.toLowerCase().includes(query))
        ) {
          matches.push({
            categoryTitle: cat.title,
            ...item,
          });
        }
      });
    });
    return matches;
  }, [searchQuery]);

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    setShowInfo(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col inset-0 !translate-x-0 !translate-y-0 h-[100dvh] w-full max-w-none rounded-none border-0 gap-0 p-0 shadow-none [&>button[class*='absolute']]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-muted/5 shrink-0">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-bold">{AI_NAME}</DialogTitle>
            <p className="text-[11px] text-muted-foreground">Plain-language control for TaskMates</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground active:scale-95 transition-transform"
            aria-label="What TaskMate AI can do"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategoryIndex(0);
              setActiveCategoryId(null);
              setShowInfo(true);
            }}
          >
            <Info className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 text-destructive active:scale-95 transition-transform" aria-label="Delete AI chat">
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
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground active:scale-95 transition-all shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
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

        {/* Input area */}
        <div className="border-t border-border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {suggestedCommands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => void send(command)}
                className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground active:scale-95 transition-all"
              >
                {command}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex items-end gap-2">
            <div className="relative flex-1">
              <Wand2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={`Message ${AI_NAME}`}
                rows={2}
                className="max-h-32 min-h-[3.5rem] resize-none rounded-xl bg-background pl-9 pr-3 text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!input.trim() || typing} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── Prompt Guide Dialog ── */}
    <Dialog open={showInfo} onOpenChange={(open) => {
      setShowInfo(open);
      if (!open) {
        setActiveCategoryId(null);
        setSearchQuery("");
      }
    }}>
      <DialogContent className="flex flex-col inset-0 !translate-x-0 !translate-y-0 h-[100dvh] w-full max-w-none rounded-none border-0 gap-0 p-0 shadow-none [&>button[class*='absolute']]:hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-muted/20 shrink-0">
          {activeCategoryId !== null ? (
            <button
              type="button"
              onClick={() => setActiveCategoryId(null)}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground active:scale-95 transition-all shrink-0"
              aria-label="Back to categories"
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="size-4 animate-pulse" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-extrabold">
              {activeCategoryId !== null ? PROMPT_CATEGORIES[activeCategoryId].title : "AI Prompt Guide"}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              {activeCategoryId !== null
                ? PROMPT_CATEGORIES[activeCategoryId].description
                : "Tap a category or search. Tap any prompt to try it."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo(false)}
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground active:scale-95 transition-all shrink-0"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search bar */}
        {activeCategoryId === null && (
          <div className="border-b border-border px-4 py-3 bg-background shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-background">
          {searchQuery.trim() ? (
            /* Search Results */
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground">
                  Results for "{searchQuery}"
                </h3>
                <span className="text-[11px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-bold">
                  {filteredItems.length}
                </span>
              </div>

              {filteredItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredItems.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-card/50 p-3.5 space-y-2.5 shadow-soft">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold text-foreground">{item.name}</h4>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-0.5 rounded">
                          {item.categoryTitle}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{item.description}</p>
                      <div className="space-y-1.5">
                        {item.examples.map((example) => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => handleExampleClick(example)}
                            className="flex items-center justify-between gap-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs font-semibold text-foreground/90 active:bg-primary/5 transition-all duration-200"
                          >
                            <span className="flex-1">{example}</span>
                            <span className="text-[10px] text-primary font-bold shrink-0">Try</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <Bot className="size-10 text-muted-foreground animate-bounce" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">No results found</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Try 'post', 'group', 'theme', or 'friend'.</p>
                  </div>
                </div>
              )}
            </div>
          ) : activeCategoryId === null ? (
            /* Category List */
            <div className="p-4 space-y-2">
              {PROMPT_CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.title}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(idx);
                    setSelectedCategoryIndex(idx);
                  }}
                  className="flex items-center gap-3.5 w-full p-3.5 rounded-xl border border-border bg-card/40 active:scale-[0.98] active:bg-card transition-all duration-200 text-left"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-extrabold text-foreground">{cat.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{cat.description}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            /* Category Detail */
            <div className="p-4 space-y-3">
              {PROMPT_CATEGORIES[activeCategoryId].items.map((item) => (
                <div key={item.name} className="rounded-xl border border-border bg-card/50 p-3.5 space-y-2.5 shadow-soft">
                  <div>
                    <h4 className="text-xs font-extrabold text-foreground">{item.name}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <div className="space-y-1.5">
                    {item.examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handleExampleClick(example)}
                        className="flex items-center justify-between gap-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs font-semibold text-foreground/90 active:bg-primary/5 transition-all duration-200"
                      >
                        <span className="flex-1">{example}</span>
                        <span className="text-[10px] text-primary font-bold shrink-0">Try</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
});

AiChat.displayName = "AiChat";
