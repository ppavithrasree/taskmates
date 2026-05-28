import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BookOpen, Bot, Clock3, Database, Download, FileText, HelpCircle, Info, KeyRound, LockKeyhole, MessageCircle, Moon, Pencil, Search, Shield, Sun, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { AI_NAME } from "@/features/ai/constants";
import { removeGeminiKey, saveAiEnabled, saveGeminiKey } from "@/features/ai/storage";
import { useAiSettings } from "@/features/ai/useAiSettings";
import { APP_VERSION } from "@/lib/otaUpdate";
import type { Visibility } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Settings = () => {
  const { currentUser, users, settings, updateTheme, updateTimeFormat, updateUserSettings, runRetentionCleanup, getAcceptedConnectionIds } = useApp();
  const [draftRetentionDays, setDraftRetentionDays] = useState(currentUser?.retentionDays ?? 5);
  const [confirmRetentionOpen, setConfirmRetentionOpen] = useState(false);
  const [retentionInfoOpen, setRetentionInfoOpen] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState("");
  const [aboutQuery, setAboutQuery] = useState("");
  const savedRetentionDays = currentUser?.retentionDays ?? 5;

  useEffect(() => {
    if (confirmRetentionOpen) return;
    setDraftRetentionDays(savedRetentionDays);
  }, [savedRetentionDays, confirmRetentionOpen]);

  if (!currentUser) return null;
  const connections = users.filter((user) => getAcceptedConnectionIds(currentUser.id).includes(user.id));

  const saveRetentionDays = () => {
    if (draftRetentionDays === currentUser.retentionDays) {
      toast.info("Auto-delete period is already saved.");
      return;
    }
    if (draftRetentionDays < currentUser.retentionDays) {
      setConfirmRetentionOpen(true);
      return;
    }
    applyRetentionDays();
  };

  const applyRetentionDays = () => {
    updateUserSettings({ retentionDays: draftRetentionDays });
    runRetentionCleanup();
    toast.success("Auto-delete period saved.");
    setConfirmRetentionOpen(false);
  };

  const discardRetentionDraft = () => {
    setDraftRetentionDays(currentUser.retentionDays);
  };

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-black"><Sun className="size-4 text-amber-500 fill-amber-500" /> Theme</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={settings.theme === "light" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTheme("light")}
            >
              <Sun className="mr-2 size-4 text-amber-500 fill-amber-500" /> Light
            </Button>
            <Button
              type="button"
              variant="outline"
              className={settings.theme === "dark" ? "border-accent bg-accent-soft text-accent" : "bg-card"}
              onClick={() => updateTheme("dark")}
            >
              <Moon className="mr-2 size-4 text-indigo-400 fill-indigo-400" /> Dark
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-black"><Clock3 className="size-4 text-sky-500" /> Time Format</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={(settings.timeFormat ?? "24") === "12" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTimeFormat("12")}
            >
              12 hours
            </Button>
            <Button
              type="button"
              variant="outline"
              className={(settings.timeFormat ?? "24") === "24" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTimeFormat("24")}
            >
              24 hours
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="flex items-center gap-2 font-black"><Shield className="size-4 text-emerald-500" /> Privacy</h2>
          <Select value={currentUser.privacy} onValueChange={(value) => updateUserSettings({ privacy: value as Visibility })}>
            <SelectTrigger className="h-11 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="connections">Connections</SelectItem>
              <SelectItem value="custom">Custom usernames</SelectItem>
            </SelectContent>
          </Select>
          {currentUser.privacy === "custom" && (
            <UsernameChecklist
              users={connections}
              selectedUsernames={currentUser.customUsernames}
              query={usernameQuery}
              onQueryChange={setUsernameQuery}
              onToggle={(username, checked) => {
                const current = currentUser.customUsernames ?? [];
                updateUserSettings({
                  customUsernames: checked
                    ? [...new Set([...current, username])]
                    : current.filter((item) => item !== username),
                });
              }}
            />
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-background p-3 text-left">
            <div className="flex min-w-0 items-center gap-3">
              {currentUser.notificationsEnabled === false ? <BellOff className="size-4 text-muted-foreground" /> : <Bell className="size-4 text-rose-500 fill-rose-500" />}
              <div className="min-w-0">
                <p className="font-black">Notifications</p>
                <p className="text-xs text-muted-foreground">{currentUser.notificationsEnabled === false ? "Off" : "On"}</p>
              </div>
            </div>
            <Switch
              checked={currentUser.notificationsEnabled !== false}
              onCheckedChange={(checked) => updateUserSettings({ notificationsEnabled: checked })}
              aria-label="Notifications"
            />
          </div>
        </section>

        <AiSettingsCard userId={currentUser.id} />

        <AboutHelpCenter query={aboutQuery} onQueryChange={setAboutQuery} />

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-black"><Trash2 className="size-4 text-red-500" /> Auto-Delete Period</h2>
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setRetentionInfoOpen(true)} aria-label="Auto-delete info">
              <Info className="size-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Auto-delete after</span>
            <span className="font-black">{currentUser.retentionDays} days</span>
          </div>
          <div className="space-y-2">
            <Slider min={1} max={60} step={1} value={[draftRetentionDays]} onValueChange={([retentionDays]) => setDraftRetentionDays(retentionDays)} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Selected</span>
              <span className="font-bold">{draftRetentionDays} days</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {draftRetentionDays !== currentUser.retentionDays && (
              <Button variant="ghost" onClick={discardRetentionDraft}>Cancel</Button>
            )}
            <Button variant="outline" onClick={saveRetentionDays}>Save</Button>
          </div>
        </section>
      </div>

      <AlertDialog open={confirmRetentionOpen} onOpenChange={setConfirmRetentionOpen}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Change auto-delete period?</AlertDialogTitle>
            <AlertDialogDescription>
              You are reducing the period from {currentUser.retentionDays} days to {draftRetentionDays} days. Older activity logs may be deleted after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardRetentionDraft}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={applyRetentionDays}
            >
              Yes, save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={retentionInfoOpen} onOpenChange={setRetentionInfoOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader><DialogTitle>Auto-delete period</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            Posts, group messages, and notifications older than this period will be deleted automatically.
          </p>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

type AboutTopic = {
  title: string;
  tags: string[];
  items: string[];
  link?: { label: string; href: string };
};

type AboutSection = {
  title: string;
  icon: typeof Info;
  summary: string;
  topics: AboutTopic[];
};

const aboutSections: AboutSection[] = [
  {
    title: "What TaskMates Is",
    icon: BookOpen,
    summary: "A private daily activity log, social feed, group chat, tasks, reminders, and optional AI assistant in one app.",
    topics: [
      {
        title: "Main idea",
        tags: ["app", "overview", "what is taskmates", "daily activity"],
        items: [
          "Log what you did during blocks of time so your day has a clear timeline.",
          "See your own coverage for the day and fill missing time gaps.",
          "Share visible activity updates with everyone, connections, or custom usernames.",
          "Chat in private groups, reply to messages, react, pin, edit, and delete messages.",
        ],
      },
      {
        title: "Main screens",
        tags: ["dashboard", "groups", "friends", "profile", "tasks", "notifications", "settings"],
        items: [
          "Dashboard: log activity, view coverage, read posts, search another user's posts.",
          "Groups: create groups with connections and send encrypted group messages.",
          "Friends: send, accept, reject, and remove connection requests.",
          "Tasks: keep local reminders and simple to-dos.",
          "Settings: privacy, time format, notifications, AI key, auto-delete, and this help center.",
        ],
      },
    ],
  },
  {
    title: "Privacy And Protection",
    icon: LockKeyhole,
    summary: "TaskMates limits visibility by your settings and stores protected message content as ciphertext.",
    topics: [
      {
        title: "What is stored",
        tags: ["storage", "stored", "database", "firestore", "cloud"],
        items: [
          "Account profile: user id, username, privacy choices, notification preference, time format, and last seen time.",
          "Activity posts: time range, text, visibility, likes, comments, and timestamps.",
          "Connections: who sent/received a request and whether it is accepted.",
          "Groups: group name, member ids, timestamps, and group settings.",
          "Notifications and FCM tokens: used only to deliver app notifications to your device.",
        ],
      },
      {
        title: "Ciphertext messages",
        tags: ["ciphertext", "encryption", "encrypted", "chat privacy", "readable"],
        items: [
          "Group message text is encrypted before syncing and stored without plaintext content.",
          "Firestore stores the encrypted ciphertext and IV for group messages.",
          "The app decrypts messages on your device so group members can read them in the chat UI.",
          "Push notifications contain a short message preview so Android can show a notification.",
        ],
      },
      {
        title: "Visibility controls",
        tags: ["privacy", "public", "connections", "custom", "who can see"],
        items: [
          "Public posts are visible to signed-in users.",
          "Connections posts are visible to accepted connections.",
          "Custom posts are visible only to selected usernames.",
          "Private group messages are visible only to members listed in that group.",
        ],
      },
      {
        title: "What is local only",
        tags: ["local", "device", "gemini key", "api key", "tasks"],
        items: [
          "Your Gemini API key is saved on your device storage for your signed-in user.",
          "AI chat history, processed AI mentions, and the floating AI button position are local app data.",
          "Simple tasks/reminders are stored locally on the device unless another feature explicitly syncs them.",
        ],
      },
    ],
  },
  {
    title: "How To Use",
    icon: HelpCircle,
    summary: "Quick practical steps for the most common flows.",
    topics: [
      {
        title: "Log activity",
        tags: ["log", "logs", "activity", "timeline", "coverage", "unlogged", "gap"],
        items: [
          "Tap Log on the Dashboard.",
          "The app pre-fills the first unlogged time range for today.",
          "Write what happened during that block and choose who can see it.",
          "Use coverage to see how much of today has been logged.",
        ],
      },
      {
        title: "Friends and feed",
        tags: ["friends", "connections", "feed", "posts", "comments", "replies"],
        items: [
          "Find people in Friends and send a request.",
          "Accepted connections can see connection-only activity posts.",
          "Tap a feed item to view that user's posts grouped by day.",
          "Comments can have nested replies; replies notify the comment author.",
        ],
      },
      {
        title: "Groups and delivery ticks",
        tags: ["groups", "chat", "message", "ticks", "single tick", "double tick", "read"],
        items: [
          "Single tick means your message was created/sent but not delivered to all receivers yet.",
          "Gray double tick means all receivers have delivered the message with internet/device sync.",
          "Blue double tick means all receivers have read the message.",
          "Receiver internet off means the sender should stay on single tick until the receiver reconnects and receives/syncs.",
        ],
      },
      {
        title: "Auto-delete period",
        tags: ["auto delete", "retention", "delete old data", "cleanup"],
        items: [
          "Choose how many days to keep posts, group messages, and notifications.",
          "Reducing the period may remove older data sooner.",
          "Use a larger value when you want more history on the device and in sync.",
        ],
      },
    ],
  },
  {
    title: "AI Assistant And API Key",
    icon: KeyRound,
    summary: "TaskMate AI is optional and uses your own Gemini key.",
    topics: [
      {
        title: "What AI can do",
        tags: ["ai", "taskmate ai", "assistant", "gemini", "commands"],
        items: [
          "Answer questions about your activity, groups, posts, tasks, and settings.",
          "Create groups, send group updates, schedule messages, edit posts, comment, and manage settings from plain language.",
          "Reply in groups when you mention @TaskMate AI and the assistant is enabled.",
        ],
      },
      {
        title: "How to get a Gemini API key",
        tags: ["api key", "gemini key", "google ai studio", "create project"],
        items: [
          "Open Google AI Studio using the link below.",
          "Sign in with a Google account.",
          "Click Create API key.",
          "Choose an existing Google Cloud project or create/import any project for this app.",
          "Copy the key and paste it in Settings > TaskMate AI > Gemini API key.",
        ],
        link: { label: "Open Google AI Studio", href: "https://aistudio.google.com/apikey" },
      },
      {
        title: "AI privacy",
        tags: ["ai privacy", "api key storage", "gemini data"],
        items: [
          "The key is stored locally on your device for your signed-in user.",
          "When you ask AI a question, relevant app context can be sent to Gemini to answer or infer an action.",
          "Do not paste secrets into AI chat unless you are comfortable sending them to the model provider.",
        ],
      },
    ],
  },
  {
    title: "Updates And Releases",
    icon: Download,
    summary: `Current installed app version: ${APP_VERSION}. Updates are checked from the app's public version file.`,
    topics: [
      {
        title: "How updates work",
        tags: ["update", "release", "apk", "version", "ota"],
        items: [
          "The app checks a hosted version.json file every time it opens and then about every 6 hours.",
          "If version.json has a higher version than the installed app, the header shows a download update button.",
          "The download button opens the APK link from the latest GitHub Release.",
          "If minVersion is higher than the installed app, the update becomes required.",
        ],
      },
      {
        title: "10-day forced update",
        tags: ["force update", "10 days", "dismiss", "required update"],
        items: [
          "When a user dismisses an optional update, the first dismiss date is saved locally.",
          "After 10 days from that dismiss date, the app treats the update as required.",
          "You do not need to manually wait 10 days for normal release flow; this logic is automatic.",
        ],
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: MessageCircle,
    summary: "Fast checks for common problems.",
    topics: [
      {
        title: "Messages or ticks feel wrong",
        tags: ["message not delivering", "ticks wrong", "single tick", "double tick", "internet off"],
        items: [
          "Deploy the latest FCM server so it does not mark delivered just because push was sent.",
          "Make sure the receiver installed the latest APK.",
          "Receiver internet off should keep sender at single tick until receiver receives/syncs.",
          "If a message remains pending, reopen the app with internet so the sync queue can flush.",
        ],
      },
      {
        title: "Posts or comments missing",
        tags: ["comments missing", "posts missing", "sync", "visibility"],
        items: [
          "Check the post visibility: public, connections, or custom usernames.",
          "Confirm both users are signed in and connected when viewing connection-only posts.",
          "Nested replies appear under the exact comment they reply to.",
          "When offline, comments appear locally first and sync after reconnecting.",
        ],
      },
      {
        title: "Notifications not coming",
        tags: ["notifications", "fcm", "push", "android"],
        items: [
          "Enable Notifications in Settings.",
          "Allow Android notification permission.",
          "Confirm the FCM server URL and API key are configured in the build.",
          "Open the app once after installing so it can register the device token.",
        ],
      },
    ],
  },
  {
    title: "Terms And Conditions",
    icon: FileText,
    summary: "Plain-language usage terms for this app.",
    topics: [
      {
        title: "User responsibility",
        tags: ["terms", "rules", "responsibility", "content"],
        items: [
          "Use TaskMates for lawful personal, productivity, and collaboration use.",
          "You are responsible for what you post, comment, message, or ask AI to do.",
          "Do not share abusive, illegal, or private information without permission.",
          "Keep your account password and API keys private.",
        ],
      },
      {
        title: "Data and availability",
        tags: ["terms", "backup", "availability", "delete"],
        items: [
          "Auto-delete can remove older logs, messages, and notifications based on your setting.",
          "Offline changes sync best-effort after reconnecting.",
          "No app can guarantee permanent availability of local device data, push services, or third-party AI services.",
        ],
      },
    ],
  },
];

const AboutHelpCenter = ({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) => {
  const term = query.trim().toLowerCase();
  const visibleSections = !term
    ? aboutSections
    : aboutSections
      .map((section) => ({
        ...section,
        topics: section.topics.filter((topic) => {
          const haystack = [
            section.title,
            section.summary,
            topic.title,
            topic.tags.join(" "),
            topic.items.join(" "),
          ].join(" ").toLowerCase();
          return haystack.includes(term);
        }),
      }))
      .filter((section) => section.topics.length > 0);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Info className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-black">About, Help & Privacy</h2>
          <p className="text-sm leading-6 text-muted-foreground">Searchable docs for using TaskMates, privacy, AI setup, updates, FAQs, and troubleshooting.</p>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search logs, storage, privacy, API key, ticks, updates..."
          className="h-11 bg-background pl-9"
        />
      </div>
      {visibleSections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No help topic matched your search.</p>
      ) : (
        <div className="space-y-3">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <details key={section.title} className="group rounded-lg border border-border bg-background p-3" open={Boolean(term)}>
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-black">{section.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.summary}</span>
                  </span>
                  <span className="text-xs font-black text-muted-foreground group-open:hidden">Open</span>
                  <span className="hidden text-xs font-black text-muted-foreground group-open:inline">Close</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {section.topics.map((topic) => (
                    <article key={topic.title} className="rounded-lg border border-border/70 bg-card p-3">
                      <h3 className="text-sm font-black">{topic.title}</h3>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
                        {topic.items.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                      {topic.link && (
                        <a
                          href={topic.link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-sm font-bold text-primary underline underline-offset-2"
                        >
                          {topic.link.label}
                        </a>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {topic.tags.slice(0, 6).map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
      <div className="grid gap-2 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
        <p><Database className="mr-1 inline size-3.5 text-primary" /> Synced data uses Firebase/Firestore collections for users, posts, groups, messages, notifications, and tokens.</p>
        <p><Shield className="mr-1 inline size-3.5 text-emerald-500" /> Group message bodies are stored as encrypted ciphertext, while app settings control who can see posts.</p>
      </div>
    </section>
  );
};

const UsernameChecklist = ({
  users,
  selectedUsernames,
  query,
  onQueryChange,
  onToggle,
}: {
  users: { id: string; username: string }[];
  selectedUsernames: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (username: string, checked: boolean) => void;
}) => {
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (users.length === 0) return <p className="text-sm text-muted-foreground">Connect with people first, then choose custom usernames.</p>;
  return (
    <div className="space-y-3">
      <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search usernames" className="bg-background" />
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No matching usernames.</p>
        ) : (
          filtered.map((user) => (
            <label key={user.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <Checkbox checked={selectedUsernames.includes(user.username)} onCheckedChange={(checked) => onToggle(user.username, checked === true)} />
              <span className="font-bold">{user.username}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

const AiSettingsCard = ({ userId }: { userId: string }) => {
  const { enabled, hasKey } = useAiSettings(userId);
  const [draftKey, setDraftKey] = useState("");
  const [editing, setEditing] = useState(!hasKey);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hasKey) {
      setDraftKey("");
      setEditing(false);
    }
  }, [hasKey]);

  const saveKey = async () => {
    setSaving(true);
    try {
      await saveGeminiKey(userId, draftKey);
      setDraftKey("");
      setEditing(false);
      toast.success("Gemini API key saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save API key.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-background p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className={enabled ? "size-4 text-purple-500" : "size-4 text-muted-foreground"} />
          <div className="min-w-0">
            <h2 className="font-black">{AI_NAME}</h2>
            <p className="text-xs text-muted-foreground">{enabled ? "Assistant enabled" : "Assistant disabled"}</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            saveAiEnabled(checked);
            toast.success(checked ? `${AI_NAME} enabled.` : `${AI_NAME} disabled.`);
          }}
          aria-label={`Enable ${AI_NAME}`}
        />
      </div>

      {enabled && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <KeyRound className="size-4 text-indigo-500" />
              <p className="font-bold">Gemini API key</p>
            </div>
            {hasKey && !editing && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 size-3.5" /> Edit
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Get your free API key from{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary underline underline-offset-2"
            >
              aistudio.google.com/apikey
            </a>
          </p>

          {hasKey && !editing ? (
            <Input
              value="saved-key-placeholder"
              readOnly
              type="password"
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              className="h-11 select-none bg-card"
              aria-label="Saved Gemini API key"
            />
          ) : (
            <div className="space-y-3">
              <Input
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Paste Gemini API key"
                className="h-11 bg-card"
              />
              <div className="flex justify-end gap-2">
                {hasKey && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDraftKey("");
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                )}
                {hasKey && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      removeGeminiKey(userId);
                      setEditing(true);
                      toast.success("Gemini API key removed.");
                    }}
                  >
                    Remove
                  </Button>
                )}
                <Button type="button" onClick={saveKey} disabled={saving || !draftKey.trim()}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default Settings;
