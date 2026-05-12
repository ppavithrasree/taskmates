import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { PostForm } from "@/features/posts/PostForm";
import { useApp } from "@/context/AppContext";
import { activityStats, startOfLocalDay } from "@/lib/timeCoverage";
import { formatTimeRange24 } from "@/lib/dateTime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { Post, User } from "@/types";

const Dashboard = () => {
  const { currentUser, users, posts, visibleFeedPosts, markNotificationsForLinkRead, presenceByUserId } = useApp();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const logHistoryRef = useRef(false);
  const selectedUserHistoryRef = useRef(false);
  const myPosts = useMemo(
    () => currentUser ? posts.filter((post) => post.userId === currentUser.id && !post.deletedAt) : [],
    [currentUser, posts]
  );
  const stats = activityStats(myPosts);
  const latestPostsByUser = useMemo(() => {
    const map = new Map<string, Post>();
    for (const post of visibleFeedPosts) {
      const existing = map.get(post.userId);
      if (!existing || post.startTime > existing.startTime) map.set(post.userId, post);
    }
    return [...map.values()].sort((a, b) => b.startTime - a.startTime);
  }, [visibleFeedPosts]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const selectedUserPosts = useMemo(
    () => selectedUserId
      ? visibleFeedPosts.filter((post) => post.userId === selectedUserId).sort((a, b) => b.startTime - a.startTime)
      : [],
    [selectedUserId, visibleFeedPosts]
  );
  const selectedUserDays = useMemo(() => groupPostsByDay(selectedUserPosts), [selectedUserPosts]);

  useEffect(() => {
    markNotificationsForLinkRead("/dashboard");
  }, [markNotificationsForLinkRead]);

  useEffect(() => {
    if (!open || logHistoryRef.current) return;
    window.history.pushState({ ...window.history.state, taskmatesModal: "log-activity" }, "", window.location.href);
    logHistoryRef.current = true;
  }, [open]);

  useEffect(() => {
    const onPopState = () => {
      if (selectedUserHistoryRef.current) {
        selectedUserHistoryRef.current = false;
        setSelectedUserId(null);
        return;
      }
      if (!logHistoryRef.current) return;
      logHistoryRef.current = false;
      setOpen(false);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const closeLog = () => {
    if (logHistoryRef.current) {
      logHistoryRef.current = false;
      window.history.back();
    }
    setOpen(false);
  };

  const openUserFeed = (userId: string) => {
    if (!selectedUserHistoryRef.current) {
      window.history.pushState({ ...window.history.state, taskmatesFeedUser: userId }, "", window.location.href);
      selectedUserHistoryRef.current = true;
    }
    setSelectedUserId(userId);
  };

  const closeUserFeed = () => {
    if (selectedUserHistoryRef.current) {
      selectedUserHistoryRef.current = false;
      window.history.back();
      setSelectedUserId(null);
      return;
    }
    setSelectedUserId(null);
  };

  if (!currentUser) return null;

  return (
    <AppShell title="Daily Activity">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <section className="color-band rounded-lg border border-border p-4 shadow-soft-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Hi, {currentUser.username}</p>
              <h2 className="text-2xl font-black">Cover your day</h2>
            </div>
            <Button onClick={() => setOpen(true)} className="h-11 shrink-0">
              <Plus className="mr-1 size-4" /> Log
            </Button>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Today</span>
              <span>{stats.coveragePercent}%</span>
            </div>
            <Progress value={stats.coveragePercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{stats.coveredMinutesToday} of 1440 minutes covered</p>
          </div>
        </section>

        <section className="space-y-3">
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3">
                <Button size="icon" variant="ghost" onClick={closeUserFeed} aria-label="Back to feed">
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black">{selectedUser.username}</h2>
                  <p className="text-sm text-muted-foreground">All activity grouped day by day</p>
                </div>
              </div>
              {selectedUserDays.length === 0 ? (
                <Empty text="No visible posts for this user yet." />
              ) : (
                selectedUserDays.map((day) => (
                  <section key={day.dayStart} className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
                    <div className="flex items-center gap-2 border-b border-border pb-3">
                      <CalendarDays className="size-4 text-primary" />
                      <h3 className="font-black">{formatDayLabel(day.dayStart)}</h3>
                      <span className="ml-auto text-xs font-bold text-muted-foreground">{day.posts.length} posts</span>
                    </div>
                    <div className="space-y-3">
                      {day.posts.map((post) => <PostCard key={post.id} post={post} />)}
                    </div>
                  </section>
                ))
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-black">Feed</h2>
              {latestPostsByUser.length === 0 ? (
                <Empty text="No posts yet. Log your first activity above!" />
              ) : (
                latestPostsByUser.map((post) => (
                  <LatestUserPost
                    key={post.userId}
                    post={post}
                    author={users.find((user) => user.id === post.userId)}
                    presence={presenceByUserId[post.userId]}
                    onOpen={() => openUserFeed(post.userId)}
                  />
                ))
              )}
            </>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : closeLog()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
          <PostForm onClose={closeLog} onSaved={closeLog} />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{text}</div>
);

const LatestUserPost = ({ post, author, presence, onOpen }: { post: Post; author?: User; presence?: { active?: boolean; lastSeen?: number }; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="tap-lift flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-soft transition-smooth hover:border-primary/40"
  >
    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-primary font-bold text-primary-foreground">
      {author?.username.charAt(0).toUpperCase() ?? "?"}
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{author?.username ?? "unknown"}</p>
          <p className={`truncate text-xs ${presence?.active ? "font-bold text-success" : "text-muted-foreground"}`}>{formatPresence(presence)}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted-foreground">{formatDayLabel(startOfLocalDay(post.startTime))}</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-semibold">
        <Clock3 className="size-4 text-primary" />
        {formatTimeRange24(post.startTime, post.endTime)}
      </div>
      <p className="line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{post.content}</p>
      <p className="text-xs font-bold text-primary">View all posts</p>
    </div>
  </button>
);

const formatPresence = (status?: { active?: boolean; lastSeen?: number }) => {
  if (status?.active) return "Active";
  if (!status?.lastSeen) return "Last seen unavailable";
  return `Last seen ${new Date(status.lastSeen).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const groupPostsByDay = (posts: Post[]) => {
  const map = new Map<number, Post[]>();
  for (const post of posts) {
    const dayStart = startOfLocalDay(post.startTime);
    map.set(dayStart, [...(map.get(dayStart) ?? []), post]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b - a)
    .map(([dayStart, dayPosts]) => ({
      dayStart,
      posts: dayPosts.sort((a, b) => b.startTime - a.startTime),
    }));
};

const formatDayLabel = (dayStart: number) => {
  const date = new Date(dayStart);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default Dashboard;
