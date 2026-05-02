import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Flame, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { TaskCard } from "@/features/tasks/TaskCard";
import { useApp } from "@/context/AppContext";
import { taskStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const Profile = () => {
  const { username } = useParams();
  const { currentUser, users, tasks, getFriends, updateProfile } = useApp();

  const target = username ? users.find((user) => user.username === username.toLowerCase()) : currentUser;
  const isOwn = !!currentUser && !!target && target.id === currentUser.id;
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(target?.bio ?? "");

  const userTasks = useMemo(
    () =>
      target
        ? tasks
            .filter((task) => task.authorId === target.id)
            .sort((a, b) => b.completedAt - a.completedAt)
        : [],
    [tasks, target]
  );

  const visibleTasks = useMemo(() => {
    if (!target || !currentUser) return [];
    if (isOwn) return userTasks;

    const viewerIsFriend = getFriends(target.id).some((friend) => friend.id === currentUser.id);

    return userTasks.filter((task) => {
      if (task.visibility === "private") return false;
      if (task.visibility === "public") return viewerIsFriend;
      if (task.visibility === "custom") return (task.customFriendIds ?? []).includes(currentUser.id);
      return false;
    });
  }, [userTasks, target, currentUser, isOwn, getFriends]);

  if (!currentUser) return null;

  if (!target) {
    return (
      <AppShell title="Profile">
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">User not found</h1>
          <p className="text-muted-foreground">No one with that username exists in this demo.</p>
        </main>
      </AppShell>
    );
  }

  const friends = getFriends(target.id);
  const stats = taskStats(userTasks);

  const saveProfile = () => {
    updateProfile({ bio: bio.trim() });
    setEditing(false);
    toast.success("Profile updated.");
  };

  return (
    <AppShell title="Profile">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card p-6 shadow-soft sm:p-8">
          <div className="flex items-start gap-5">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-3xl font-bold text-primary-foreground shadow-glow sm:size-24">
              {target.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold capitalize tracking-tight sm:text-3xl">{target.username}</h1>
              {!editing && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {target.bio || (isOwn ? "Add a short bio for your profile." : "No bio yet.")}
                </p>
              )}

              {editing && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    rows={3}
                    maxLength={200}
                    className="rounded-lg bg-background"
                    placeholder="A short line about how you work."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-full" onClick={saveProfile}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => {
                        setBio(target.bio ?? "");
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {isOwn && !editing && (
                <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
              )}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-6">
            <ProfileStat label="Tasks" value={stats.total} icon={CheckCircle2} tone="success" />
            <ProfileStat label="Friends" value={friends.length} icon={Users} tone="accent" />
            <ProfileStat label="Streak" value={stats.streak} icon={Flame} tone="primary" />
          </div>
        </section>

        <h2 className="mb-4 text-xl font-bold">{isOwn ? "Your task history" : "Recent activity"}</h2>
        <div className="space-y-4">
          {visibleTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Nothing to show yet.
            </div>
          ) : (
            visibleTasks.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </div>
      </div>
    </AppShell>
  );
};

const toneClasses = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
} as const;

const ProfileStat = ({
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
  <div className="text-center">
    <div className={`mx-auto mb-2 flex size-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
      <Icon className="size-4" />
    </div>
    <div className="text-2xl font-bold tabular-nums">{value}</div>
    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
  </div>
);

export default Profile;
