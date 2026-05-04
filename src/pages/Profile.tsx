import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Shield, Timer, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { useApp } from "@/context/AppContext";
import { activityStats } from "@/lib/timeCoverage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Profile = () => {
  const { username } = useParams();
  const { currentUser, users, posts, changePassword } = useApp();
  const [password, setPassword] = useState("");
  const target = currentUser ? (username ? users.find((user) => user.username === username.toLowerCase()) : currentUser) : undefined;
  const isOwn = Boolean(currentUser && target?.id === currentUser.id);
  const visiblePosts = useMemo(
    () => target ? posts.filter((post) => post.userId === target.id && !post.deletedAt).sort((a, b) => b.startTime - a.startTime) : [],
    [posts, target]
  );
  const cutoff = target ? Date.now() - target.retentionDays * 86_400_000 : 0;
  const retained = visiblePosts.filter((post) => post.endTime >= cutoff);
  const stats = activityStats(retained);

  if (!currentUser) return null;

  if (!target) {
    return <AppShell title="Profile"><div className="px-4 py-20 text-center">User not found.</div></AppShell>;
  }

  const savePassword = () => {
    const result = changePassword(password);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success("Password changed locally.");
      setPassword("");
    }
  };

  return (
    <AppShell title="Profile">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-2xl font-black text-primary-foreground">{target.username.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black">{target.username}</h1>
              <p className="truncate text-sm text-muted-foreground">{target.email}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-primary-soft px-2 py-1 text-primary">{stats.total} retained posts</span>
                <span className="rounded-full bg-success-soft px-2 py-1 text-success">{target.retentionDays} day retention</span>
              </div>
            </div>
          </div>
        </section>

        {isOwn && (
          <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
            <h2 className="mb-3 flex items-center gap-2 font-black"><KeyRound className="size-4 text-primary" /> Change password</h2>
            <div className="flex gap-2">
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="bg-background" />
              <Button onClick={savePassword}>Save</Button>
            </div>
          </section>
        )}

        <section className="grid grid-cols-3 gap-3">
          <Info icon={Timer} label="Today coverage" value={`${stats.coveragePercent}%`} />
          <Info icon={Shield} label="Privacy" value={target.privacy} />
          <Info icon={Users} label="Connections" value={`${target.connections.length}`} />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-black">{isOwn ? "Your retained posts" : "Posts"}</h2>
          {retained.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No retained posts.</div>
          ) : (
            retained.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </section>
      </div>
    </AppShell>
  );
};

const Info = ({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
    <Icon className="mb-2 size-4 text-accent" />
    <p className="text-xl font-black capitalize">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

export default Profile;
