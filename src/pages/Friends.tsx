import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { FriendCard } from "@/features/friends/FriendCard";
import { useApp } from "@/context/AppContext";
import { Input } from "@/components/ui/input";

const Friends = () => {
  const { currentUser, searchUsers, requests, users, getFriends } = useApp();
  const [query, setQuery] = useState("");

  const results = useMemo(() => searchUsers(query), [query, searchUsers]);
  const incoming = currentUser
    ? requests.filter((request) => request.toId === currentUser.id && request.status === "pending")
    : [];
  const outgoing = currentUser
    ? requests.filter((request) => request.fromId === currentUser.id && request.status === "pending")
    : [];
  const friends = currentUser ? getFriends(currentUser.id) : [];

  if (!currentUser) return null;

  return (
    <AppShell title="Friends">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <p className="text-sm text-muted-foreground">Your accountability circle</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Friends</h1>
        </header>

        <section className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by username"
              className="h-12 rounded-full bg-card pl-11 shadow-soft"
            />
          </div>

          {query.trim() && (
            <div className="space-y-3">
              {results.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">No users match "{query}".</p>
              ) : (
                results.map((user) => <FriendCard key={user.id} user={user} context="search" />)
              )}
            </div>
          )}
        </section>

        {incoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              Requests
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs font-bold text-accent-foreground">
                {incoming.length}
              </span>
            </h2>
            {incoming.map((request) => {
              const user = users.find((candidate) => candidate.id === request.fromId);
              return user ? <FriendCard key={request.id} user={user} requestId={request.id} context="incoming" /> : null;
            })}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-bold">
            Your friends <span className="text-sm font-medium text-muted-foreground">- {friends.length}</span>
          </h2>
          {friends.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Users className="size-5" />
              </div>
              <p className="font-semibold">No friends yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Search above to find someone to connect with.
              </p>
            </div>
          ) : (
            friends.map((user) => <FriendCard key={user.id} user={user} context="friend" />)
          )}
        </section>

        {outgoing.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Awaiting reply</h2>
            {outgoing.map((request) => {
              const user = users.find((candidate) => candidate.id === request.toId);
              return user ? <FriendCard key={request.id} user={user} context="outgoing" /> : null;
            })}
          </section>
        )}
      </div>
    </AppShell>
  );
};

export default Friends;
