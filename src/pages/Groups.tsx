import { FormEvent, ReactNode, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Info, LogOut, Plus, Send, Trash2, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { formatClockTime24 } from "@/lib/dateTime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { User } from "@/types";

const Groups = () => {
  const { groupId } = useParams();
  return groupId ? <GroupChat groupId={groupId} /> : <GroupsList />;
};

const GroupsList = () => {
  const { currentUser, users, visibleGroups, groupMessages, getAcceptedConnectionIds, createGroup } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (!currentUser) return null;

  const connectionIds = getAcceptedConnectionIds(currentUser.id);
  const connections = users.filter((user) => connectionIds.includes(user.id));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = createGroup({ name, memberIds: selectedIds });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Group created.");
    setName("");
    setSelectedIds([]);
    setCreateOpen(false);
  };

  return (
    <AppShell title="Groups">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Groups</h1>
          <Button onClick={() => setCreateOpen(true)} className="h-10 shrink-0">
            <Plus className="mr-1 size-4" /> Create group
          </Button>
        </div>

        {visibleGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No groups yet.
          </div>
        ) : (
          <section className="space-y-2">
            {visibleGroups.map((group) => {
              const lastMessage = groupMessages
                .filter((message) => message.groupId === group.id)
                .sort((a, b) => b.createdAt - a.createdAt)[0];
              const sender = users.find((user) => user.id === lastMessage?.senderId);
              return (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="tap-lift flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
                >
                  <GroupAvatar name={group.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate font-bold">{group.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {lastMessage ? formatClockTime24(lastMessage.createdAt) : `${group.memberIds.length} members`}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {lastMessage ? `${sender?.username ?? "Unknown"}: ${lastMessage.content}` : "Tap to start chatting"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Create group</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" className="h-11 bg-background" />
            <MemberPicker
              users={connections}
              selectedIds={selectedIds}
              onToggle={(id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])}
              emptyText="No connections yet."
            />
            <Button type="submit" className="w-full">Create group</Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const GroupChat = ({ groupId }: { groupId: string }) => {
  const {
    currentUser,
    users,
    groups,
    groupMessages,
    getAcceptedConnectionIds,
    addGroupMessage,
    addGroupMembers,
    removeGroupMember,
    exitGroup,
  } = useApp();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const group = groups.find((item) => item.id === groupId);
  const isMember = Boolean(currentUser && group?.memberIds.includes(currentUser.id));

  const messages = useMemo(
    () => groupMessages.filter((item) => item.groupId === groupId).sort((a, b) => a.createdAt - b.createdAt),
    [groupMessages, groupId]
  );

  if (!currentUser) return null;
  if (!group || !isMember) return <Navigate to="/groups" replace />;

  const members = group.memberIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const connectionIds = getAcceptedConnectionIds(currentUser.id);
  const addableUsers = users.filter((user) => connectionIds.includes(user.id) && !group.memberIds.includes(user.id));

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const result = addGroupMessage(group.id, message);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMessage("");
  };

  const addMembers = () => {
    const result = addGroupMembers(group.id, selectedIds);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Members added.");
    setSelectedIds([]);
    setAddOpen(false);
  };

  const removeMember = (memberId: string) => {
    const result = removeGroupMember(group.id, memberId);
    if (!result.ok) toast.error(result.error);
    else toast.success("Member removed.");
  };

  const leave = () => {
    const result = exitGroup(group.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Exited group.");
    navigate("/groups");
  };

  return (
    <AppShell title="Groups">
      <div className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-3xl flex-col px-4 py-4">
        <header className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
          <Button asChild size="icon" variant="ghost" className="shrink-0">
            <Link to="/groups"><ArrowLeft className="size-4" /></Link>
          </Button>
          <GroupAvatar name={group.name} />
          <button type="button" onClick={() => setInfoOpen(true)} className="min-w-0 flex-1 text-left">
            <h1 className="truncate text-lg font-black">{group.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{members.map((member) => member.username).join(", ")}</p>
          </button>
          <Button size="icon" variant="ghost" onClick={() => setInfoOpen(true)} aria-label="Group info">
            <Info className="size-4" />
          </Button>
        </header>

        <section className="flex-1 space-y-3 overflow-y-auto pb-4">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No messages yet.
            </div>
          ) : (
            messages.map((item) => {
              const mine = item.senderId === currentUser.id;
              const sender = users.find((user) => user.id === item.senderId);
              return (
                <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-lg px-3 py-2 shadow-soft ${mine ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}>
                    {!mine && <p className="mb-1 text-xs font-bold text-accent">{sender?.username ?? "Unknown"}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>
                    <p className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      {formatClockTime24(item.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <form onSubmit={sendMessage} className="sticky bottom-20 flex gap-2 rounded-lg border border-border bg-background p-2 shadow-soft sm:bottom-24">
          <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message" className="h-11 bg-card" />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0">
            <Send className="size-4" />
          </Button>
        </form>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Group info</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 text-center">
            <GroupAvatar name={group.name} large />
            <div className="min-w-0">
              <h2 className="break-words text-xl font-black">{group.name}</h2>
              <p className="text-sm text-muted-foreground">{members.length} members</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black">Members</h3>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="mr-1 size-4" /> Add
              </Button>
            </div>
            {members.map((member) => (
              <PersonRow
                key={member.id}
                username={member.username}
                detail={member.id === currentUser.id ? "You" : "Member"}
                action={
                  <Button size="sm" variant="outline" onClick={() => removeMember(member.id)}>
                    <Trash2 className="mr-1 size-4" /> Remove
                  </Button>
                }
              />
            ))}
          </div>
          <Button variant="destructive" onClick={leave}>
            <LogOut className="mr-2 size-4" /> Exit group
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>Add members</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <MemberPicker
              users={addableUsers}
              selectedIds={selectedIds}
              onToggle={(id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])}
              emptyText="All your connections are already in this group."
            />
            <Button onClick={addMembers} className="w-full">Add members</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const MemberPicker = ({
  users,
  selectedIds,
  onToggle,
  emptyText,
}: {
  users: User[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) => (
  <div className="space-y-2">
    {users.length === 0 ? (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
    ) : (
      users.map((user) => (
        <button
          key={user.id}
          type="button"
          onClick={() => onToggle(user.id)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left shadow-soft transition-smooth ${
            selectedIds.includes(user.id) ? "border-primary bg-primary-soft" : "border-border bg-card"
          }`}
        >
          <PersonIdentity username={user.username} detail="Connection" />
          <span className={`flex size-5 items-center justify-center rounded border text-xs font-black ${
            selectedIds.includes(user.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}>
            {selectedIds.includes(user.id) ? <Check className="size-3" /> : null}
          </span>
        </button>
      ))
    )}
  </div>
);

const GroupAvatar = ({ name, large = false }: { name: string; large?: boolean }) => (
  <div className={`${large ? "size-20" : "size-12"} relative shrink-0`}>
    <div className={`absolute left-0 top-2 flex ${large ? "size-11" : "size-7"} items-center justify-center rounded-full bg-accent-soft text-accent`}>
      <UsersRound className={large ? "size-5" : "size-3.5"} />
    </div>
    <div className={`absolute right-0 top-2 flex ${large ? "size-11" : "size-7"} items-center justify-center rounded-full bg-success-soft text-success`}>
      <UsersRound className={large ? "size-5" : "size-3.5"} />
    </div>
    <div className={`absolute bottom-0 left-1/2 flex ${large ? "size-14" : "size-9"} -translate-x-1/2 items-center justify-center rounded-full bg-gradient-primary font-black text-primary-foreground shadow-soft`}>
      {name.charAt(0).toUpperCase()}
    </div>
  </div>
);

const PersonRow = ({ username, detail, action }: { username: string; detail: string; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
    <PersonIdentity username={username} detail={detail} />
    {action}
  </div>
);

const PersonIdentity = ({ username, detail }: { username: string; detail: string }) => (
  <div className="flex min-w-0 items-center gap-3">
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-black text-accent">
      {username.charAt(0).toUpperCase()}
    </div>
    <div className="min-w-0">
      <p className="truncate font-bold">{username}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  </div>
);

export default Groups;
