import { useMemo, useState } from "react";
import { AlertTriangle, Clock3, Plus, RadioTower, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { PostForm } from "@/features/posts/PostForm";
import { useApp } from "@/context/AppContext";
import { activityStats, analyzeDayCoverage, gapLabel, startOfLocalDay } from "@/lib/timeCoverage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const Dashboard = () => {
  const { currentUser, posts, visibleFeedPosts, coverageAlerts } = useApp();
  const [open, setOpen] = useState(false);
  const myPosts = useMemo(
    () => currentUser ? posts.filter((post) => post.userId === currentUser.id && !post.deletedAt) : [],
    [currentUser, posts]
  );
  const stats = activityStats(myPosts);
  const todayCoverage = useMemo(() => analyzeDayCoverage(myPosts, startOfLocalDay(Date.now())), [myPosts]);
  const latestAlert = currentUser ? coverageAlerts.find((alert) => alert.userId === currentUser.id && !alert.seen) : undefined;

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
            <p className="text-xs text-muted-foreground">{stats.coveredMinutesToday} of 1440 minutes covered. Overlaps are merged locally.</p>
          </div>
        </section>

        {latestAlert && (
          <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-bold">You missed logging activity for some time today</p>
                <p className="mt-1 text-muted-foreground">{latestAlert.gaps.slice(0, 4).map(gapLabel).join(", ")}</p>
              </div>
            </div>
          </section>
        )}

        <section className="grid grid-cols-3 gap-3">
          <Stat label="Posts" value={stats.total} icon={Clock3} tone="primary" />
          <Stat label="Gaps" value={todayCoverage.gaps.length} icon={AlertTriangle} tone="accent" />
          <Stat label="Feed" value={visibleFeedPosts.length} icon={RadioTower} tone="success" />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Feed</h2>
            <ShieldCheck className="size-5 text-success" />
          </div>
          {visibleFeedPosts.length === 0 ? (
            <Empty text="No posts yet. Logs appear from local cache first, then sync updates in the background." />
          ) : (
            visibleFeedPosts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
          <PostForm onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const tones = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
} as const;

const Stat = ({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Clock3; tone: keyof typeof tones }) => (
  <div className="tap-lift rounded-lg border border-border bg-card p-3 shadow-soft">
    <div className={`mb-2 flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}>
      <Icon className="size-4" />
    </div>
    <p className="text-2xl font-black tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{text}</div>
);

export default Dashboard;
