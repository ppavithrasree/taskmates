import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Inbox, Search, Send, Trash2, UserRound, UsersRound, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Friends = () => {
  const { currentUser, users, connections, searchUsers, sendRequest, respondRequest, deleteConnection, getAcceptedConnectionIds, getConnectionStatus, markNotificationsForLinkRead, presenceByUserId } = useApp();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchUsers(query), [query, searchUsers]);

  useEffect(() => {
    markNotificationsForLinkRead("/friends");
  }, [markNotificationsForLinkRead]);

  if (!currentUser) return null;

  const incoming = connections.filter((connection) => connection.receiverId === currentUser.id && connection.status === "pending");
  const connectedUserIds = getAcceptedConnectionIds(currentUser.id);
  const people = users.filter((user) => connectedUserIds.includes(user.id));

  const request = (id: string) => {
    sendRequest(id);
    toast.success("Connection request sent.");
  };

  const removeConnection = (userId: string) => {
    deleteConnection(userId);
  };

  return (
    <AppShell title="Search">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5">
        <section className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username..." className="h-12 rounded-lg bg-card pl-10 shadow-soft" />
          </div>
          {query.trim() && (
            <div className="space-y-2">
              {results.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">No available users to connect with.</p>
              ) : (
                results.map((user) => {
                  const status = getConnectionStatus(user.id);
                  const theirIds = getAcceptedConnectionIds(user.id);
                  const mutualCount = connectedUserIds.filter((id) => theirIds.includes(id)).length;
                  return (
                    <PersonRow
                      key={user.id}
                      username={user.username}
                      status={status}
                      mutualCount={mutualCount}
                      presence={presenceByUserId[user.id]}
                      action={
                        status === "none" ? (
                          <Button size="sm" onClick={() => request(user.id)}>
                            <UserPlus className="mr-1 size-4" /> Add
                          </Button>
                        ) : status === "outgoing" ? (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        ) : null
                      }
                    />
                  );
                })
              )}
            </div>
          )}
        </section>

        {incoming.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xl font-black">Requests</h2>
            {incoming.map((connection) => {
              const sender = users.find((user) => user.id === connection.senderId);
              if (!sender) return null;
              return (
                <PersonRow
                  key={connection.id}
                  username={sender.username}
                  status="incoming"
                  presence={presenceByUserId[sender.id]}
                  action={
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={() => respondRequest(connection.id, true)}>
                        <CheckCircle2 className="size-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => respondRequest(connection.id, false)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  }
                />
              );
            })}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xl font-black">Connections ({people.length})</h2>
          {people.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No accepted connections yet.
            </div>
          ) : (
            people.map((user) => (
              <PersonRow
                key={user.id}
                username={user.username}
                status="connected"
                presence={presenceByUserId[user.id]}
                action={
                  <Button size="sm" variant="destructive" onClick={() => removeConnection(user.id)}>
                    <Trash2 className="mr-1 size-4" /> Remove
                  </Button>
                }
              />
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
};

const statusMeta = {
  self: { label: "You", icon: UserRound, tone: "text-primary" },
  connected: { label: "Connected", icon: CheckCircle2, tone: "text-success" },
  incoming: { label: "Incoming request", icon: Inbox, tone: "text-accent" },
  outgoing: { label: "Pending request", icon: Send, tone: "text-accent" },
  none: { label: "", icon: UsersRound, tone: "text-muted-foreground" },
} as const;

const PersonRow = ({
  username,
  status,
  mutualCount = 0,
  presence,
  action,
}: {
  username: string;
  status: keyof typeof statusMeta;
  mutualCount?: number;
  presence?: { active?: boolean; lastSeen?: number };
  action?: ReactNode;
}) => {
  const meta = statusMeta[status];
  const Icon = meta.icon;

  return (
    <div className="tap-lift flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
      <Link to={`/profile/${username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-black text-accent">
          {username.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{username}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className={`size-3 ${meta.tone}`} />
            <span>{status === "connected" ? formatPresence(presence) : status === "none" ? `${mutualCount} mutual${mutualCount === 1 ? "" : "s"}` : meta.label}</span>
          </div>
        </div>
      </Link>
      {action}
    </div>
  );
};

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

export default Friends;
