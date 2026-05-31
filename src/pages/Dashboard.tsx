import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock3, CloudOff, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { PostForm } from "@/features/posts/PostForm";
import { useApp } from "@/context/AppContext";
import { activityStats, startOfLocalDay } from "@/lib/timeCoverage";
import { formatDayAwareDateTime, formatTimeRange } from "@/lib/dateTime";
import { LinkifiedText } from "@/components/LinkifiedText";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Post, User } from "@/types";

const Dashboard = () => {
  const { currentUser, users, posts, settings, visibleFeedPosts, markNotificationsForLinkRead, presenceByUserId, online, syncPendingCount } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  const autoLog = searchParams.get("autoLog") === "1";
  const gapStart = searchParams.get("gapStart");
  const gapEnd = searchParams.get("gapEnd");
  const dayParam = searchParams.get("day");

  const prefilledStart = useMemo(() => {
    if (!autoLog || !gapStart) return undefined;
    const dayStart = dayParam ? Number(dayParam) : startOfLocalDay(Date.now());
    return dayStart + Number(gapStart) * 60_000;
  }, [autoLog, gapStart, dayParam]);

  const prefilledEnd = useMemo(() => {
    if (!autoLog || !gapEnd) return undefined;
    const dayStart = dayParam ? Number(dayParam) : startOfLocalDay(Date.now());
    return dayStart + Number(gapEnd) * 60_000;
  }, [autoLog, gapEnd, dayParam]);
  const [postSearchOpen, setPostSearchOpen] = useState(false);
  const [postSearch, setPostSearch] = useState("");
  const logHistoryRef = useRef(false);
  const selectedUserId = searchParams.get("feedUser");
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
  const postSearchTerm = postSearch.trim().toLowerCase();
  const filteredSelectedUserPosts = useMemo(() => {
    if (!postSearchTerm) return selectedUserPosts;
    return selectedUserPosts.filter((post) =>
      post.content.toLowerCase().includes(postSearchTerm) ||
      formatDayLabel(startOfLocalDay(post.startTime)).toLowerCase().includes(postSearchTerm) ||
      formatTimeRange(post.startTime, post.endTime, settings.timeFormat).toLowerCase().includes(postSearchTerm)
    );
  }, [postSearchTerm, selectedUserPosts, settings.timeFormat]);
  const selectedUserDays = useMemo(() => groupPostsByDay(filteredSelectedUserPosts), [filteredSelectedUserPosts]);

  useEffect(() => {
    markNotificationsForLinkRead("/dashboard");
  }, [markNotificationsForLinkRead]);

  useEffect(() => {
    if (autoLog) {
      setOpen(true);
    }
  }, [autoLog]);

  const targetPostId = searchParams.get("post");
  const targetCommentId = searchParams.get("comment");

  useEffect(() => {
    if (targetPostId && !selectedUserId) {
      const targetPost = posts.find((p) => p.id === targetPostId);
      if (targetPost) {
        navigate(`/dashboard?feedUser=${encodeURIComponent(targetPost.userId)}&post=${targetPostId}${targetCommentId ? `&comment=${targetCommentId}` : ""}`, { replace: true });
      }
    }
  }, [targetPostId, selectedUserId, posts, navigate, targetCommentId]);

  useEffect(() => {
    if (!targetPostId) return;
    const timer = window.setTimeout(() => {
      if (targetCommentId) {
        const commentEl = document.getElementById(`comment-${targetCommentId}`);
        if (commentEl) {
          commentEl.scrollIntoView({ behavior: "smooth", block: "center" });
          commentEl.classList.add("ring-2", "ring-accent");
          window.setTimeout(() => {
            commentEl.classList.remove("ring-2", "ring-accent");
          }, 2000);
          return;
        }
      }
      const postEl = document.getElementById(`post-${targetPostId}`);
      if (postEl) {
        postEl.scrollIntoView({ behavior: "smooth", block: "center" });
        postEl.classList.add("ring-2", "ring-accent");
        window.setTimeout(() => {
          postEl.classList.remove("ring-2", "ring-accent");
        }, 2000);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [targetPostId, targetCommentId, selectedUserId]);

  useEffect(() => {
    if (!open || logHistoryRef.current) return;
    window.history.pushState({ ...window.history.state, taskmatesModal: "log-activity" }, "", window.location.href);
    logHistoryRef.current = true;
  }, [open]);

  useEffect(() => {
    const onPopState = () => {
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
    if (autoLog) {
      navigate("/dashboard", { replace: true });
    }
  };

  const openUserFeed = (userId: string) => {
    navigate(`/dashboard?feedUser=${encodeURIComponent(userId)}`);
  };

  const closeUserFeed = () => {
    setPostSearch("");
    setPostSearchOpen(false);
    navigate("/dashboard");
  };

  if (!currentUser) return null;

  return (
    <AppShell title="Daily Activity">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        {!online && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 shadow-soft dark:text-amber-200">
            <CloudOff className="size-4 shrink-0" />
            <p className="font-bold">
              You are offline{syncPendingCount > 0 ? ` - ${syncPendingCount} pending change${syncPendingCount === 1 ? "" : "s"} will sync when you reconnect.` : "."}
            </p>
          </div>
        )}
        {/* ── Hero Stats Card ── */}
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-accent/8 to-success/8 p-5 shadow-soft-lg animate-fade-in-up">
          <div className="absolute -right-6 -top-6 size-24 rounded-full bg-gradient-primary opacity-10 blur-2xl" />
          <div className="absolute -left-4 -bottom-4 size-20 rounded-full bg-accent/20 blur-xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
              <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-primary via-accent to-success bg-clip-text text-transparent">{currentUser.username}</h2>
            </div>
            <Button onClick={() => setOpen(true)} className="h-11 shrink-0 rounded-xl bg-gradient-primary shadow-glow">
              <Plus className="mr-1 size-4" /> Log
            </Button>
          </div>
          <div className="relative mt-5 space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Today's Coverage</span>
              <span className="text-gradient-primary font-black">{stats.coveragePercent}%</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/60">
              <div className="h-full rounded-full bg-gradient-primary transition-all duration-700 ease-out" style={{ width: `${stats.coveragePercent}%` }} />
            </div>
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
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-black">{selectedUser.username}</h2>
                  <p className="text-sm text-muted-foreground">All activity grouped day by day</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">{filteredSelectedUserPosts.length} posts</span>
                  <Button size="icon" variant="ghost" onClick={() => setPostSearchOpen((value) => !value)} aria-label="Search posts">
                    <Search className="size-4" />
                  </Button>
                </div>
              </div>
              {postSearchOpen && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={postSearch}
                    onChange={(event) => setPostSearch(event.target.value)}
                    placeholder="Search this user's posts"
                    className="h-11 bg-background pl-9"
                    autoFocus
                  />
                </div>
              )}
              {selectedUserDays.length === 0 ? (
                <Empty text={postSearchTerm ? "No matching posts." : "No visible posts for this user yet."} />
              ) : (
                selectedUserDays.map((day) => (
                  <section key={day.dayStart} className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
                    <div className="flex items-center gap-2 border-b border-border pb-3">
                      <CalendarDays className="size-4 text-primary" />
                      <h3 className="font-black">{formatDayLabel(day.dayStart)}</h3>
                      <span className="ml-auto text-xs font-bold text-muted-foreground">{day.posts.length} posts</span>
                    </div>
                    <div className="space-y-3">
                      {day.posts.map((post) => <PostCard key={post.id} post={post} timestampMode="timeOnly" />)}
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
                    presence={presenceByUserId[post.userId] ?? { active: false, lastSeen: users.find((user) => user.id === post.userId)?.lastSeen }}
                    timeFormat={settings.timeFormat}
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
          <PostForm
            onClose={closeLog}
            onSaved={closeLog}
            prefilledStart={prefilledStart}
            prefilledEnd={prefilledEnd}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground animate-fade-in-up backdrop-blur-sm">
    <div className="mx-auto mb-3 size-12 rounded-full bg-gradient-soft flex items-center justify-center">
      <Clock3 className="size-5 text-muted-foreground" />
    </div>
    {text}
  </div>
);

const LatestUserPost = ({ post, author, presence, timeFormat, onOpen }: { post: Post; author?: User; presence?: { active?: boolean; lastSeen?: number }; timeFormat?: "12" | "24"; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 text-left shadow-soft backdrop-blur-sm"
  >
    <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary font-bold text-primary-foreground text-lg shadow-md">
      {author?.username.charAt(0).toUpperCase() ?? "?"}
      {presence?.active && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-emerald-500 shadow-sm" />
      )}
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{author?.username ?? "unknown"}</p>
          <p className={`whitespace-normal break-words text-xs ${presence?.active ? "font-bold text-emerald-500" : "text-muted-foreground"}`}>{formatPresence(presence, timeFormat)}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{formatDayLabel(startOfLocalDay(post.startTime))}</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl bg-primary/8 px-3 py-2 text-sm font-semibold text-primary">
        <Clock3 className="size-4" />
        {formatTimeRange(post.startTime, post.endTime, timeFormat)}
      </div>
      <div className="max-h-[2.75rem] overflow-hidden">
        <LinkifiedText text={post.content} className="line-clamp-2 block text-sm leading-relaxed text-foreground/80" />
      </div>
      <p className="text-xs font-bold text-primary">View all posts →</p>
    </div>
  </button>
);

const formatPresence = (status?: { active?: boolean; lastSeen?: number }, timeFormat: "12" | "24" = "24") => {
  if (status?.active) return "Active";
  if (!status?.lastSeen) return "Last seen unavailable";
  return `Last seen ${formatDayAwareDateTime(status.lastSeen, timeFormat)}`;
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
