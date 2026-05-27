import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Shield, Timer, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PostCard } from "@/features/posts/PostCard";
import { useApp } from "@/context/AppContext";
import { subscribeUserConnections } from "@/lib/firebaseSync";
import { activityStats } from "@/lib/timeCoverage";
import { formatDayAwareDateTime } from "@/lib/dateTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Connection } from "@/types";

const Profile = () => {
  const { username } = useParams();
  const { currentUser, users, posts, settings, changePassword, getAcceptedConnectionIds, presenceByUserId } = useApp();
  const [password, setPassword] = useState("");
  const [profileConnections, setProfileConnections] = useState<Connection[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const target = currentUser ? (username ? users.find((user) => user.username === username.toLowerCase()) : currentUser) : undefined;
  const isOwn = Boolean(currentUser && target?.id === currentUser.id);
  const connectedIds = useMemo(
    () => currentUser ? new Set(getAcceptedConnectionIds(currentUser.id)) : new Set<string>(),
    [currentUser, getAcceptedConnectionIds]
  );
  const visiblePosts = useMemo(
    () => {
      if (!target) return [];
      return posts
        .filter((post) => {
          if (post.deletedAt) return false;
          if (post.userId !== target.id) return false;
          if (isOwn) return true;
          // Respect privacy settings when viewing other users' profiles
          const visibility = post.visibility ?? target.privacy ?? "public";
          if (visibility === "public") return true;
          if (visibility === "connections") return connectedIds.has(post.userId);
          return (post.customUsernames ?? target.customUsernames ?? []).includes(currentUser!.username);
        })
        .sort((a, b) => b.startTime - a.startTime);
    },
    [posts, target, isOwn, connectedIds, currentUser]
  );
  const cutoff = target ? Date.now() - target.retentionDays * 86_400_000 : 0;
  const retained = visiblePosts.filter((post) => post.endTime >= cutoff);
  const stats = activityStats(retained);
  useEffect(() => {
    setProfileConnections([]);
    setShowConnections(false);
    if (!target?.id) return;
    return subscribeUserConnections(target.id, setProfileConnections);
  }, [target?.id]);

  const targetConnectionIds = useMemo(() => {
    if (!target) return [];
    const remoteIds = deriveAcceptedIds(profileConnections, target.id);
    return remoteIds.length > 0 ? remoteIds : getAcceptedConnectionIds(target.id);
  }, [target, profileConnections, getAcceptedConnectionIds]);
  const connectionCount = targetConnectionIds.length;
  const canSeeTargetConnections = Boolean(isOwn || (target && connectedIds.has(target.id)));
  const targetConnections = canSeeTargetConnections
    ? users.filter((user) => targetConnectionIds.includes(user.id)).sort((a, b) => a.username.localeCompare(b.username))
    : [];
  const privacyLabel = target?.privacy === "custom" ? "Custom users" : target?.privacy ?? "";

  if (!currentUser) return null;

  if (!target) {
    return <AppShell title="Profile"><div className="px-4 py-20 text-center">User not found.</div></AppShell>;
  }

  const savePassword = () => {
    const result = changePassword(password);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success("Password changed.");
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
              {!isOwn && (
                <p className={`mt-1 text-sm ${presenceByUserId[target.id]?.active ? "font-bold text-success" : "text-muted-foreground"}`}>
                  {formatPresence(presenceByUserId[target.id] ?? { active: false, lastSeen: target.lastSeen }, settings.timeFormat)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-primary-soft px-2 py-1 text-primary">{stats.total} saved posts</span>
                <span className="rounded-full bg-success-soft px-2 py-1 text-success">Saved for {target.retentionDays} days</span>
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
          <Info icon={Shield} label="Privacy" value={privacyLabel} />
          <Info
            icon={Users}
            label="Connections"
            value={`${connectionCount}`}
            onClick={canSeeTargetConnections ? () => setShowConnections((open) => !open) : undefined}
            active={showConnections}
          />
        </section>

        {canSeeTargetConnections && showConnections && (
          <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
            <h2 className="flex items-center gap-2 font-black"><Users className="size-4 text-primary" /> Connections</h2>
            {targetConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No connections yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {targetConnections.map((user) => (
                  <Link key={user.id} to={`/profile/${user.username}`} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft font-black text-primary">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate font-bold">{user.username}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-black">{isOwn ? "Your saved posts" : "Posts"}</h2>
          {retained.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No saved posts.</div>
          ) : (
            retained.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </section>
      </div>
    </AppShell>
  );
};

const Info = ({
  icon: Icon,
  label,
  value,
  onClick,
  active = false,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`min-w-0 rounded-lg border border-border bg-card p-3 text-left shadow-soft sm:p-4 ${onClick ? "transition-smooth hover:border-primary/50 active:scale-[0.98]" : "cursor-default"} ${active ? "border-primary bg-primary-soft" : ""}`}
  >
    <Icon className="mb-2 size-4 text-accent" />
    <p className="break-words text-sm font-black capitalize leading-tight min-[360px]:text-base sm:text-xl">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </button>
);

export default Profile;

const deriveAcceptedIds = (connections: Connection[], userId: string): string[] => {
  const ids: string[] = [];
  for (const connection of connections) {
    if (connection.status !== "accepted") continue;
    if (connection.senderId === userId) ids.push(connection.receiverId);
    else if (connection.receiverId === userId) ids.push(connection.senderId);
  }
  return [...new Set(ids)];
};

const formatPresence = (status?: { active?: boolean; lastSeen?: number }, timeFormat: "12" | "24" = "24") => {
  if (status?.active) return "Active";
  if (!status?.lastSeen) return "Last seen unavailable";
  return `Last seen ${formatDayAwareDateTime(status.lastSeen, timeFormat)}`;
};
