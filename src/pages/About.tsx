import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Heart,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { APP_VERSION } from "@/lib/otaUpdate";

type Topic = {
  title: string;
  tags: string[];
  points: string[];
  link?: { label: string; href: string };
};

type Section = {
  title: string;
  icon: typeof BookOpen;
  summary: string;
  topics: Topic[];
};

const sections: Section[] = [
  {
    title: "Getting Started",
    icon: BookOpen,
    summary: "What TaskMates is and how the app is organized.",
    topics: [
      {
        title: "What TaskMates does",
        tags: ["overview", "home", "app", "what is taskmates"],
        points: [
          "TaskMates helps you log your day, share progress, chat with groups, manage tasks, and keep reminders.",
          "The app is built around time blocks, so your day becomes a clear timeline instead of scattered notes.",
          "You choose who can see each activity post: everyone, only connections, or selected usernames.",
          "Most screens keep working from saved app data when your internet is off; new changes sync when you reconnect.",
        ],
      },
      {
        title: "Bottom navigation",
        tags: ["tabs", "navigation", "feed", "search", "groups", "profile", "settings"],
        points: [
          "Feed opens your Dashboard, activity log, and visible posts.",
          "Search opens Friends, where you find users and manage connection requests.",
          "Groups opens your group chats.",
          "Profile opens your profile and your visible activity history.",
          "Settings opens theme, time, privacy, notifications, AI, About, and auto-delete options.",
        ],
      },
      {
        title: "Top bar buttons",
        tags: ["notifications", "tasks", "logout", "update", "download"],
        points: [
          "Bell opens Notifications.",
          "Clipboard opens Tasks.",
          "Logout signs you out of this device.",
          "A download button appears when a newer app version is available.",
        ],
      },
    ],
  },
  {
    title: "Dashboard And Logs",
    icon: CalendarClock,
    summary: "How activity logging, coverage, and feed posts work.",
    topics: [
      {
        title: "Log button",
        tags: ["log", "logs", "activity", "start time", "end time", "unlogged"],
        points: [
          "Tap Log to write what you did during a time block.",
          "Start time automatically picks the first unlogged time for today.",
          "If the next log starts before the suggested 2-hour block ends, the form stops before that next log.",
          "If no logs exist today, the form starts at 12:00 AM.",
          "A log must cover at least 5 minutes and cannot be far in the future.",
        ],
      },
      {
        title: "Time range fields",
        tags: ["date", "month", "year", "hour", "minute", "12 hour", "24 hour"],
        points: [
          "Date, month, year, hour, and minute fields define the start and end time.",
          "The selected time format in Settings controls whether the form shows 12-hour or 24-hour time.",
          "Use current time sets the end time to now.",
        ],
      },
      {
        title: "Activity story",
        tags: ["story", "post", "content", "activity"],
        points: [
          "Write the full story of what happened in that block.",
          "This text becomes a feed post if the selected visibility allows other users to see it.",
          "Links inside posts are clickable.",
        ],
      },
      {
        title: "Visibility choices",
        tags: ["privacy", "public", "connections", "custom"],
        points: [
          "Public allows signed-in users to see the post.",
          "Connections allows accepted connections to see it.",
          "Custom usernames allows only selected people to see it.",
          "Your default post visibility comes from Settings > Privacy.",
        ],
      },
      {
        title: "Today coverage",
        tags: ["coverage", "progress", "minutes", "gaps"],
        points: [
          "Coverage shows how many minutes of today are logged.",
          "Missing time ranges become gaps the next Log form can fill.",
          "Coverage is based on your own posts for the current day.",
        ],
      },
      {
        title: "Feed cards",
        tags: ["feed", "posts", "like", "comment", "edit", "delete"],
        points: [
          "Tap a feed card to view that user's visible posts grouped by day.",
          "Like marks appreciation for a post and can notify the author.",
          "Comments support replies under the exact comment you reply to.",
          "You can edit or delete only your own posts.",
          "A post author can delete comments on their post.",
        ],
      },
    ],
  },
  {
    title: "Friends And Search",
    icon: UserPlus,
    summary: "Finding people and controlling who can interact with you.",
    topics: [
      {
        title: "Find people",
        tags: ["search", "friends", "users", "username"],
        points: [
          "Use Search/Friends to find people by username.",
          "The app shows connection status: connected, incoming request, outgoing request, or none.",
          "You cannot send a request to yourself or duplicate an existing connection.",
        ],
      },
      {
        title: "Requests",
        tags: ["request", "accept", "reject", "decline"],
        points: [
          "Send Request asks another user to connect.",
          "Accept makes both users connections.",
          "Decline removes the request.",
          "Pending request badges show in the bottom Search tab.",
        ],
      },
      {
        title: "Remove connection",
        tags: ["remove", "unfriend", "delete connection"],
        points: [
          "Removing a connection stops connection-only posts from being visible to that user.",
          "Public posts can still be visible depending on your privacy choices.",
        ],
      },
    ],
  },
  {
    title: "Groups And Chat",
    icon: UsersRound,
    summary: "Group creation, messages, replies, reactions, and delivery ticks.",
    topics: [
      {
        title: "Create group",
        tags: ["group", "create", "members", "connections"],
        points: [
          "Tap New group in Groups.",
          "Choose a group name and select accepted connections.",
          "A group must include you and at least one connection.",
        ],
      },
      {
        title: "Group list",
        tags: ["group list", "unread", "last message"],
        points: [
          "Each group row shows the group name, last message, time, and unread count.",
          "Unread count increases for messages you have not read yet.",
        ],
      },
      {
        title: "Message composer",
        tags: ["send", "message", "reply", "typing", "draft"],
        points: [
          "Type a message and tap send.",
          "Reply icon attaches your new message to the selected message.",
          "Draft text is saved on your device for that group until sent or cleared.",
          "Typing status can appear for active group members.",
        ],
      },
      {
        title: "Message actions",
        tags: ["pin", "reaction", "edit", "delete", "info"],
        points: [
          "Reply starts a threaded message reply.",
          "Pin keeps important messages easy to find at the top.",
          "React adds or removes your emoji reaction.",
          "Edit changes your own sent message.",
          "Delete for me hides a message only for you.",
          "Delete for everyone removes your own message for group members.",
          "Info shows delivered, read, waiting, and reaction details for your messages.",
        ],
      },
      {
        title: "Delivery ticks",
        tags: ["tick", "single tick", "double tick", "blue tick", "delivered", "read", "internet"],
        points: [
          "Single tick means your message was created but not delivered to all receivers yet.",
          "Gray double tick means all receivers' devices/apps received or synced the message.",
          "Blue double tick means all receivers read the message.",
          "If a receiver's internet is off, your message should remain single tick until their device reconnects and receives/syncs it.",
        ],
      },
      {
        title: "Group info",
        tags: ["info", "members", "rename", "add members", "remove", "leave", "mute"],
        points: [
          "Info opens group details.",
          "Edit name renames the group.",
          "Add members adds accepted connections.",
          "Remove deletes a member from the group.",
          "Mute notifications stops alerts from that group.",
          "Exit group removes you from the group.",
        ],
      },
      {
        title: "Clear chat",
        tags: ["clear", "delete chat", "history"],
        points: [
          "Clear chat deletes all messages in that group chat.",
          "Use this carefully because it removes chat history.",
        ],
      },
    ],
  },
  {
    title: "Profile",
    icon: Shield,
    summary: "Your identity, privacy, password, and visible activity history.",
    topics: [
      {
        title: "Your profile",
        tags: ["profile", "username", "last seen", "posts"],
        points: [
          "Profile shows your username, status/last seen, and visible activity posts.",
          "Opening another user's profile respects their post visibility settings.",
        ],
      },
      {
        title: "Password",
        tags: ["password", "change password", "account"],
        points: [
          "Change Password updates your account password.",
          "When online, the password change is also sent to the account service.",
          "Keep your password private and do not share it in chats or AI prompts.",
        ],
      },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    summary: "Where alerts appear and how to manage them.",
    topics: [
      {
        title: "Notification inbox",
        tags: ["notifications", "inbox", "read", "delete"],
        points: [
          "The bell opens your notification inbox.",
          "Notifications can include friend requests, accepted requests, likes, comments, replies, group messages, reactions, and activity-gap reminders.",
          "Opening a linked notification takes you to the relevant screen when possible.",
          "You can mark notifications read or delete them.",
        ],
      },
      {
        title: "Android alerts",
        tags: ["android", "push", "permission", "alerts"],
        points: [
          "Allow notification permission on Android to receive alerts when the app is closed.",
          "Open the app once after installing so your device can register for notifications.",
          "If notifications are disabled in Settings, the app stops sending alerts to you.",
        ],
      },
    ],
  },
  {
    title: "Tasks And Reminders",
    icon: CheckCircle2,
    summary: "Simple personal tasks stored on your device.",
    topics: [
      {
        title: "Tasks screen",
        tags: ["tasks", "todo", "reminder", "local"],
        points: [
          "Use Tasks for personal to-dos and reminders.",
          "Add a task, optionally choose a reminder time, and mark it complete when done.",
          "Tasks are personal device data and are not shown to other users.",
        ],
      },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    summary: "Personal app controls.",
    topics: [
      {
        title: "Theme and time format",
        tags: ["theme", "light", "dark", "time format", "12", "24"],
        points: [
          "Theme switches between light and dark mode.",
          "Time format switches between 12-hour and 24-hour display.",
        ],
      },
      {
        title: "Privacy",
        tags: ["privacy", "default visibility", "custom usernames"],
        points: [
          "Privacy chooses the default visibility for new activity logs.",
          "Custom usernames lets you pick exactly who can see your custom posts.",
        ],
      },
      {
        title: "Notifications switch",
        tags: ["notifications", "on", "off", "mute"],
        points: [
          "Turn notifications on to receive app alerts.",
          "Turn notifications off when you do not want app alerts sent to you.",
        ],
      },
      {
        title: "Auto-delete period",
        tags: ["auto delete", "retention", "cleanup", "old data"],
        points: [
          "Auto-delete controls how many days old posts, group messages, and notifications are kept.",
          "Lower values reduce stored history.",
          "Higher values keep more history.",
        ],
      },
    ],
  },
  {
    title: "TaskMate AI",
    icon: Bot,
    summary: "Optional assistant powered by your own Gemini API key.",
    topics: [
      {
        title: "Enable AI",
        tags: ["ai", "assistant", "taskmate ai", "enable"],
        points: [
          "Turn on TaskMate AI in Settings.",
          "Save your Gemini API key.",
          "Tap the floating AI button to chat with the assistant.",
          "Mention @TaskMate AI in a group to ask it to reply there.",
        ],
      },
      {
        title: "What AI can do",
        tags: ["ai commands", "actions", "help"],
        points: [
          "Answer questions about app usage.",
          "Create groups, add members, send messages, schedule messages, change settings, create reminders, edit posts, and comment when you ask clearly.",
          "Show prompt examples inside the AI guide.",
        ],
      },
      {
        title: "Get Gemini API key",
        tags: ["gemini", "api key", "google ai studio", "create project"],
        points: [
          "Open Google AI Studio from the link below.",
          "Sign in with Google.",
          "Click Create API key.",
          "Choose an existing project or create any new project for this app.",
          "Copy the key and paste it in Settings > TaskMate AI.",
        ],
        link: { label: "Open Google AI Studio", href: "https://aistudio.google.com/apikey" },
      },
      {
        title: "AI privacy",
        tags: ["ai privacy", "api key", "data"],
        points: [
          "Your API key is saved on your device for your signed-in user.",
          "When you ask AI something, relevant app context may be sent to Gemini so it can answer or perform an action.",
          "Do not paste secrets into AI chat.",
        ],
      },
    ],
  },
  {
    title: "Privacy And Data",
    icon: LockKeyhole,
    summary: "What is stored and how visibility works.",
    topics: [
      {
        title: "What the app stores",
        tags: ["stored", "storage", "data", "privacy"],
        points: [
          "Your username, account id, privacy choices, theme, time format, notification choice, and last seen time.",
          "Activity logs with time range, story text, visibility, likes, comments, and replies.",
          "Connections and requests.",
          "Groups, members, message metadata, reactions, pins, delivery/read status, and encrypted message text.",
          "Notifications for your account.",
          "Device-only data such as drafts, AI key, AI chat history, task reminders, and local preferences.",
        ],
      },
      {
        title: "Encrypted group messages",
        tags: ["encrypted", "ciphertext", "readable", "messages"],
        points: [
          "Group message bodies are encrypted before storage.",
          "Stored message data contains ciphertext, not normal readable text.",
          "Your device decrypts messages in the app so group members can read them.",
          "Notification previews may show message text so Android can display useful alerts.",
        ],
      },
      {
        title: "Who can see what",
        tags: ["who can see", "visibility", "public", "connections", "custom", "groups"],
        points: [
          "Public posts can be seen by signed-in users.",
          "Connection posts can be seen by accepted connections.",
          "Custom posts can be seen only by selected usernames.",
          "Group chats can be seen only by group members.",
          "Tasks and Gemini API key are personal device data.",
        ],
      },
      {
        title: "Offline data",
        tags: ["offline", "internet off", "local", "sync"],
        points: [
          "The app keeps a local copy so you can open screens while internet is off.",
          "New changes are queued and sync after reconnecting.",
          "If something was deleted from the cloud while you were offline, it disappears after the app reconnects and receives the latest sync.",
        ],
      },
    ],
  },
  {
    title: "Updates",
    icon: Download,
    summary: `Installed version: ${APP_VERSION}.`,
    topics: [
      {
        title: "Update button",
        tags: ["update", "download", "version", "apk"],
        points: [
          "When a newer version is available, the app shows a download button in the top bar.",
          "Tap it to download the latest APK.",
          "Install the APK to replace the old app while keeping your account data.",
        ],
      },
      {
        title: "Required updates",
        tags: ["required", "force update", "10 days"],
        points: [
          "Some updates can be required when an old version is no longer supported.",
          "An optional update can become required after it has been ignored for several days.",
          "Required update screens block the app until the update is installed.",
        ],
      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: HelpCircle,
    summary: "Common problems and what to check.",
    topics: [
      {
        title: "App opened with no internet",
        tags: ["offline", "internet", "not loading", "blank"],
        points: [
          "The app should still show your last synced data after you sign in once on that device.",
          "Actions made offline show locally and sync later.",
          "If this is the first install or first login on a device, internet is required to sign in and download your data.",
        ],
      },
      {
        title: "Messages not delivering",
        tags: ["message", "single tick", "double tick", "delivery"],
        points: [
          "Single tick is normal while the receiver has no internet or has not received/synced yet.",
          "Ask the receiver to open the app with internet.",
          "Make sure both phones have the latest APK.",
        ],
      },
      {
        title: "Posts or comments missing",
        tags: ["post", "comment", "missing", "visibility"],
        points: [
          "Check whether the post is Public, Connections, or Custom.",
          "Confirm you are still connected to the post author.",
          "Reconnect internet so the latest sync can remove deleted data and add new data.",
        ],
      },
      {
        title: "Notifications not arriving",
        tags: ["notifications", "permission", "android"],
        points: [
          "Turn on Notifications in Settings.",
          "Allow Android notification permission.",
          "Open the app once after installing the APK.",
          "Muted groups do not send group alerts.",
        ],
      },
    ],
  },
  {
    title: "Terms And Conditions",
    icon: FileText,
    summary: "Plain rules for using TaskMates.",
    topics: [
      {
        title: "Use responsibly",
        tags: ["terms", "rules", "content"],
        points: [
          "Use the app for lawful personal, productivity, and collaboration use.",
          "You are responsible for your posts, comments, messages, tasks, and AI requests.",
          "Do not post abusive, illegal, or private information without permission.",
          "Do not try to access another user's account or data.",
        ],
      },
      {
        title: "Data and availability",
        tags: ["terms", "availability", "delete", "backup"],
        points: [
          "Auto-delete can remove older app data based on your settings.",
          "Offline changes sync best-effort after reconnecting.",
          "Device-only data can be lost if app storage is cleared or the app is uninstalled.",
          "Third-party services such as sign-in, notifications, and AI may have their own terms.",
        ],
      },
    ],
  },
];

const About = () => {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!term) return sections;
    return sections
      .map((section) => ({
        ...section,
        topics: section.topics.filter((topic) =>
          [section.title, section.summary, topic.title, topic.tags.join(" "), topic.points.join(" ")]
            .join(" ")
            .toLowerCase()
            .includes(term)
        ),
      }))
      .filter((section) => section.topics.length > 0);
  }, [term]);

  return (
    <AppShell title="About">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <header className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-soft">
          <Link to="/settings" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground" aria-label="Back to settings">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-black">About TaskMates</h1>
            <p className="text-xs text-muted-foreground">Help center, privacy, terms, AI, updates, and feature guide.</p>
          </div>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search logs, privacy, groups, ticks, API key, updates..."
            className="h-11 bg-background pl-9"
          />
        </div>

        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="font-black">Quick summary</h2>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
            <p><Heart className="mr-1 inline size-4 text-rose-500" /> Log your day, share progress, and keep useful history.</p>
            <p><MessageCircle className="mr-1 inline size-4 text-primary" /> Chat with groups using encrypted message storage.</p>
            <p><Clock3 className="mr-1 inline size-4 text-sky-500" /> Fill missing time gaps and keep reminders.</p>
            <p><KeyRound className="mr-1 inline size-4 text-indigo-500" /> Use AI only if you add your own Gemini API key.</p>
          </div>
        </section>

        {visibleSections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">No help topic matched your search.</p>
        ) : (
          visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <details key={section.title} className="group rounded-lg border border-border bg-card p-4 shadow-soft" open={Boolean(term)}>
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-black">{section.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{section.summary}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-4 space-y-3">
                  {section.topics.map((topic) => (
                    <article key={topic.title} className="rounded-lg border border-border bg-background p-3">
                      <h3 className="text-sm font-black">{topic.title}</h3>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
                        {topic.points.map((point) => <li key={point}>- {point}</li>)}
                      </ul>
                      {topic.link && (
                        <a href={topic.link.href} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-primary underline underline-offset-2">
                          {topic.link.label}
                        </a>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {topic.tags.slice(0, 7).map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            );
          })
        )}

        <section className="rounded-lg border border-border bg-card p-4 text-xs leading-5 text-muted-foreground shadow-soft">
          <p className="font-bold text-foreground">Plain privacy promise</p>
          <p className="mt-1">TaskMates shows people only what your privacy setting allows. Group message bodies are stored encrypted, and personal device-only items stay on your device unless a feature says it syncs them.</p>
        </section>
      </div>
    </AppShell>
  );
};

export default About;
