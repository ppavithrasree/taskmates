import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { PostForm } from "@/features/posts/PostForm";
import { useApp } from "@/context/AppContext";
import { activityStats, startOfLocalDay } from "@/lib/timeCoverage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const Dashboard = () => {
  const { currentUser, posts, visibleFeedPosts } = useApp();
  const [open, setOpen] = useState(false);
  const myPosts = useMemo(
    () => currentUser ? posts.filter((post) => post.userId === currentUser.id && !post.deletedAt) : [],
    [currentUser, posts]
  );
  const stats = activityStats(myPosts);

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
          <h2 className="text-xl font-black">Feed</h2>
          {visibleFeedPosts.length === 0 ? (
            <Empty text="No posts yet. Log your first activity above!" />
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

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{text}</div>
);

export default Dashboard;
