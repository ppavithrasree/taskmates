import { ReactNode, useMemo, useState } from "react";
import { Check, Clock, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Friends = () => {
  const { currentUser, users, connections, recentSearches, searchUsers, rememberSearch, sendRequest, respondRequest, getConnections, getConnectionStatus } = useApp();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchUsers(query), [query, searchUsers]);

  if (!currentUser) return null;
  const incoming = connections.filter((connection) => connection.receiverId === currentUser.id && connection.status === "pending");
  const people = getConnections(currentUser.id);

  const request = (id: string, username: string) => {
    sendRequest(id);
    rememberSearch(username);
    toast.success("Connection request queued.");
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
              {results.length === 0 ? <p className="px-1 text-sm text-muted-foreground">No prefix matches.</p> : results.map((user) => {
                const status = getConnectionStatus(user.id);
                return (
                  <PersonRow key={user.id} username={user.username} meta={status} action={
                    status === "none" ? <Button size="sm" onClick={() => request(user.id, user.username)}><UserPlus className="mr-1 size-4" /> Add</Button> : null
                  } />
                );
              })}
            </div>
          )}
          {!query.trim() && recentSearches.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold">Recent searches</h2>
              {recentSearches.map((item) => <PersonRow key={item.username} username={item.username} meta="recent" />)}
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
                <PersonRow key={connection.id} username={sender.username} meta="pending" action={
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" onClick={() => respondRequest(connection.id, true)}><Check className="size-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => respondRequest(connection.id, false)}><X className="size-4" /></Button>
                  </div>
                } />
              );
            })}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xl font-black">Connections</h2>
          {people.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No accepted connections yet.</div>
          ) : (
            people.map((user) => <PersonRow key={user.id} username={user.username} meta="connected" />)
          )}
        </section>
      </div>
    </AppShell>
  );
};

const PersonRow = ({ username, meta, action }: { username: string; meta: string; action?: ReactNode }) => (
  <div className="tap-lift flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-black text-accent">{username.charAt(0).toUpperCase()}</div>
      <div className="min-w-0">
        <p className="truncate font-bold">{username}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {meta}</p>
      </div>
    </div>
    {action}
  </div>
);

export default Friends;
