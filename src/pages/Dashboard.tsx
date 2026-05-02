import { useState } from "react";
import { CheckCircle2, Flame, Plus, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskForm } from "@/features/tasks/TaskForm";
import { useApp } from "@/context/AppContext";
import { taskStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Dashboard = () => {
  const { currentUser, tasks, visibleFeedTasks, getFriends } = useApp();
  const [open, setOpen] = useState(false);

  if (!currentUser) return null;

  const myTasks = tasks
    .filter((task) => task.authorId === currentUser.id)
    .sort((a, b) => b.completedAt - a.completedAt);
  const friendsFeed = visibleFeedTasks.filter((task) => task.authorId !== currentUser.id);
  const friends = getFriends(currentUser.id);
  const stats = taskStats(myTasks);

  return (
    <AppShell title="Dashboard">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="capitalize">{currentUser.username}</span>
            </h1>
          </div>
          <Button onClick={() => setOpen(true)} className="h-11 shrink-0 rounded-full shadow-glow">
            <Plus className="mr-1 size-4" /> Log task
          </Button>
        </header>

        <section className="mb-6 grid grid-cols-3 gap-3">
          <StatCard label="Today" value={stats.today} icon={CheckCircle2} tone="success" />
          <StatCard label="Total" value={stats.total} icon={Sparkles} tone="primary" />
          <StatCard label="Friends" value={friends.length} icon={Users} tone="accent" />
        </section>

        <button
          onClick={() => setOpen(true)}
          className="mb-6 flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-soft transition-smooth hover:border-primary/40 hover:shadow-soft-lg"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary font-bold text-primary-foreground">
            {currentUser.username.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-sm text-muted-foreground">
            What progress do you want to log today?
          </span>
          <span className="hidden items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">
            <Plus className="size-4" /> Add
          </span>
        </button>

        <Tabs defaultValue="feed">
          <TabsList className="mb-5 h-11 rounded-full bg-secondary p-1">
            <TabsTrigger value="feed" className="rounded-full px-5">
              Friends feed
            </TabsTrigger>
            <TabsTrigger value="mine" className="rounded-full px-5">
              My tasks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-4">
            {friendsFeed.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Your feed is quiet"
                body="Add friends, then their public and custom-shared tasks will appear here."
              />
            ) : (
              friendsFeed.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-4">
            {myTasks.length === 0 ? (
              <EmptyState
                icon={Flame}
                title="No tasks yet"
                body="Log a small win. TaskMates is built for progress you can actually keep."
                action={
                  <Button onClick={() => setOpen(true)} className="mt-4 rounded-full shadow-glow">
                    <Plus className="mr-1 size-4" /> Log first task
                  </Button>
                }
              />
            ) : (
              myTasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Log a task</DialogTitle>
          </DialogHeader>
          <TaskForm onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const toneClasses = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
} as const;

const StatCard = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: keyof typeof toneClasses;
}) => (
  <div className="rounded-lg border border-border bg-card p-3 shadow-soft sm:p-4">
    <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
      <Icon className="size-4" />
    </div>
    <p className="text-2xl font-bold tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

const EmptyState = ({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
    <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon className="size-5" />
    </div>
    <h3 className="text-xl font-bold">{title}</h3>
    <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{body}</p>
    {action}
  </div>
);

export default Dashboard;
