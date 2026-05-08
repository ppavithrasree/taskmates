import { FormEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bell, BellOff, Check, CheckCheck, Info, LogOut, Pencil, Pin, PinOff, Plus, Reply, Send, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { formatClockTime24 } from "@/lib/dateTime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GroupMessage, User } from "@/types";

const Groups = () => {
  const { groupId, mode } = useParams();
  if (!groupId) return <GroupsList />;
  return mode === "info" ? <GroupInfo groupId={groupId} /> : <GroupChat groupId={groupId} />;
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
              const groupItems = groupMessages.filter((message) => message.groupId === group.id);
              const lastMessage = [...groupItems].sort((a, b) => b.createdAt - a.createdAt)[0];
              const unreadCount = groupItems.filter(
                (message) => message.senderId !== currentUser.id && !(message.readBy ?? [message.senderId]).includes(currentUser.id)
              ).length;
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
                    <div className="mt-1 flex items-center gap-3">
                      <p className={`min-w-0 flex-1 truncate text-sm ${unreadCount > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                        {lastMessage ? `${sender?.username ?? "Unknown"}: ${lastMessage.content}` : "Tap to start chatting"}
                      </p>
                      <UnreadBadge count={unreadCount} />
                    </div>
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
    addGroupMessage,
    toggleGroupMessagePin,
    markGroupMessagesRead,
    markGroupNotificationsRead,
  } = useApp();
  const [message, setMessage] = useState("");
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const swipeRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const group = groups.find((item) => item.id === groupId);
  const isMember = Boolean(currentUser && group?.memberIds.includes(currentUser.id));
  const currentUserDraftId = currentUser?.id;
  const groupDraftId = group?.id;

  const messages = useMemo(
    () => groupMessages.filter((item) => item.groupId === groupId).sort((a, b) => a.createdAt - b.createdAt),
    [groupMessages, groupId]
  );
  const selectedMessage = messages.find((item) => item.id === selectedMessageId);
  const replyToMessage = messages.find((item) => item.id === replyToMessageId);
  const pinnedMessages = useMemo(
    () => messages.filter((item) => (item.pinnedBy ?? []).includes(currentUser?.id ?? "")).sort((a, b) => b.updatedAt - a.updatedAt),
    [messages, currentUser?.id]
  );

  useEffect(() => {
    if (!currentUser || !group || !isMember) return;
    markGroupMessagesRead(group.id);
    markGroupNotificationsRead(group.id);
  }, [currentUser, group, isMember, markGroupMessagesRead, markGroupNotificationsRead, messages.length]);

  useEffect(() => {
    if (!currentUserDraftId || !groupDraftId) return;
    setMessage(localStorage.getItem(groupDraftKey(currentUserDraftId, groupDraftId)) ?? "");
    setReplyToMessageId(null);
  }, [currentUserDraftId, groupDraftId]);

  useEffect(() => {
    if (!currentUserDraftId || !groupDraftId) return;
    const key = groupDraftKey(currentUserDraftId, groupDraftId);
    if (message.trim()) localStorage.setItem(key, message);
    else localStorage.removeItem(key);
  }, [currentUserDraftId, groupDraftId, message]);

  useLayoutEffect(() => {
    const scrollToBottom = () => {
      const list = messagesRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
    };

    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    const timer = window.setTimeout(scrollToBottom, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [messages.length, groupId]);

  if (!currentUser) return null;
  if (!group || !isMember) return <Navigate to="/groups" replace />;

  const members = group.memberIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const userById = new Map(users.map((user) => [user.id, user]));

  const focusReply = (item: GroupMessage) => {
    setReplyToMessageId(item.id);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const showMessage = (id?: string) => {
    if (!id) return;
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    window.setTimeout(() => setHighlightedMessageId((current) => current === id ? null : current), 1300);
  };

  const togglePin = (item: GroupMessage) => {
    const result = toggleGroupMessagePin(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success((item.pinnedBy ?? []).includes(currentUser.id) ? "Message unpinned." : "Message pinned.");
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const result = addGroupMessage(group.id, message, replyToMessage?.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMessage("");
    setReplyToMessageId(null);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      const list = messagesRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  };

  return (
    <AppShell title="Groups" mainClassName="h-[calc(100dvh-3.5rem)] overflow-hidden pb-0">
      <div className="mx-auto flex h-full max-w-3xl flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-4">
        <header className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
          <Button asChild size="icon" variant="ghost" className="shrink-0">
            <Link to="/groups"><ArrowLeft className="size-4" /></Link>
          </Button>
          <GroupAvatar name={group.name} />
          <Link to={`/groups/${group.id}/info`} className="min-w-0 flex-1 text-left">
            <h1 className="truncate text-lg font-black">{group.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{members.map((member) => member.username).join(", ")}</p>
          </Link>
          <Button asChild size="icon" variant="ghost" aria-label="Group info">
            <Link to={`/groups/${group.id}/info`}><Info className="size-4" /></Link>
          </Button>
        </header>

        {pinnedMessages.length > 0 && (
          <section className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {pinnedMessages.map((item) => {
              const sender = userById.get(item.senderId);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => showMessage(item.id)}
                  className="flex max-w-[18rem] shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-soft"
                >
                  <Pin className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black">{sender?.username ?? "Unknown"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.content}</span>
                  </span>
                </button>
              );
            })}
          </section>
        )}

        <section ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No messages yet.
            </div>
          ) : (
            messages.map((item) => {
              const mine = item.senderId === currentUser.id;
              const sender = userById.get(item.senderId);
              const repliedTo = item.replyToMessageId ? messages.find((messageItem) => messageItem.id === item.replyToMessageId) : undefined;
              const repliedSender = repliedTo ? userById.get(repliedTo.senderId) : undefined;
              const pinned = (item.pinnedBy ?? []).includes(currentUser.id);
              return (
                <div
                  key={item.id}
                  ref={(node) => { messageRefs.current[item.id] = node; }}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  onPointerDown={(event) => {
                    swipeRef.current = { id: item.id, x: event.clientX, y: event.clientY };
                  }}
                  onPointerUp={(event) => {
                    const start = swipeRef.current;
                    swipeRef.current = null;
                    if (!start || start.id !== item.id) return;
                    const dx = event.clientX - start.x;
                    const dy = Math.abs(event.clientY - start.y);
                    if (dx > 55 && dy < 45) focusReply(item);
                  }}
                  onPointerCancel={() => { swipeRef.current = null; }}
                >
                  <div
                    className={`max-w-[82%] rounded-lg px-3 py-2 shadow-soft transition-smooth ${
                      mine ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                    } ${highlightedMessageId === item.id ? "ring-2 ring-accent" : ""}`}
                    style={{ touchAction: "pan-y" }}
                  >
                    {!mine && <p className="mb-1 text-xs font-bold text-accent">{sender?.username ?? "Unknown"}</p>}
                    {repliedTo && (
                      <button
                        type="button"
                        onClick={() => showMessage(repliedTo.id)}
                        className={`mb-2 w-full rounded border-l-2 px-2 py-1 text-left text-xs ${
                          mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-primary-soft"
                        }`}
                      >
                        <span className="block truncate font-black">{repliedSender?.username ?? "Unknown"}</span>
                        <span className="block truncate opacity-80">{repliedTo.content}</span>
                      </button>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>
                    <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      {pinned && <Pin className="size-3" />}
                      <span>{formatClockTime24(item.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => focusReply(item)}
                        className="flex items-center rounded px-0.5"
                        aria-label="Reply to message"
                      >
                        <Reply className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(item)}
                        className="flex items-center rounded px-0.5"
                        aria-label={pinned ? "Unpin message" : "Pin message"}
                      >
                        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                      </button>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => setSelectedMessageId(item.id)}
                          className="flex items-center rounded px-0.5"
                          aria-label="Message info"
                        >
                          <MessageTicks message={item} groupMemberIds={group.memberIds} currentUserId={currentUser.id} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <form onSubmit={sendMessage} className="space-y-2 rounded-lg border border-border bg-background p-2 shadow-soft">
          {replyToMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-card px-3 py-2 text-left">
              <Reply className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black">{userById.get(replyToMessage.senderId)?.username ?? "Unknown"}</p>
                <p className="truncate text-xs text-muted-foreground">{replyToMessage.content}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setReplyToMessageId(null)}>
                <X className="size-3.5" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
          <Textarea
            ref={composerRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Message"
            rows={1}
            className="max-h-32 min-h-11 resize-none bg-card py-2.5"
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0"
            onMouseDown={(event) => event.preventDefault()}
            onTouchStart={(event) => event.preventDefault()}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
          >
            <Send className="size-4" />
          </Button>
          </div>
        </form>
      </div>

      <MessageInfoDialog
        message={selectedMessage}
        members={members}
        currentUserId={currentUser.id}
        onOpenChange={(open) => !open && setSelectedMessageId(null)}
      />
    </AppShell>
  );
};

const GroupInfo = ({ groupId }: { groupId: string }) => {
  const {
    currentUser,
    users,
    groups,
    updateGroupName,
    addGroupMembers,
    removeGroupMember,
    exitGroup,
    toggleMuteGroup,
    isGroupMuted,
    getAcceptedConnectionIds,
  } = useApp();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const group = groups.find((item) => item.id === groupId);
  const isMember = Boolean(currentUser && group?.memberIds.includes(currentUser.id));

  if (!currentUser) return null;
  if (!group || !isMember) return <Navigate to="/groups" replace />;

  const members = group.memberIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const connectionIds = getAcceptedConnectionIds(currentUser.id);
  const addableUsers = users.filter((user) => connectionIds.includes(user.id) && !group.memberIds.includes(user.id));

  const startEditingName = () => {
    setName(group.name);
    setEditingName(true);
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    const result = updateGroupName(group.id, name);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Group name updated.");
    setEditingName(false);
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
    <AppShell title="Group info">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4">
        <header className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
          <Button asChild size="icon" variant="ghost" className="shrink-0">
            <Link to={`/groups/${group.id}`}><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black">Group info</h1>
            <p className="truncate text-xs text-muted-foreground">{group.name}</p>
          </div>
        </header>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-center shadow-soft">
          <GroupAvatar name={group.name} large />
          {editingName ? (
            <form onSubmit={saveName} className="space-y-3">
              <Input value={name} onChange={(event) => setName(event.target.value)} className="h-11 bg-background text-center font-bold" />
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-black">{group.name}</h2>
                <p className="text-sm text-muted-foreground">{members.length} members</p>
              </div>
              <Button variant="outline" onClick={startEditingName}>
                <Pencil className="mr-2 size-4" /> Edit name
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-2">
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
        </section>

        <button
          type="button"
          onClick={() => { toggleMuteGroup(group.id); toast.success(isGroupMuted(group.id) ? "Notifications unmuted." : "Notifications muted."); }}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-soft transition-smooth"
        >
          <div className="flex items-center gap-3">
            {isGroupMuted(group.id) ? <BellOff className="size-4 text-muted-foreground" /> : <Bell className="size-4 text-primary" />}
            <span className="text-sm font-bold">{isGroupMuted(group.id) ? "Unmute notifications" : "Mute notifications"}</span>
          </div>
          <span className={`text-xs font-bold ${isGroupMuted(group.id) ? "text-destructive" : "text-success"}`}>
            {isGroupMuted(group.id) ? "Muted" : "Active"}
          </span>
        </button>

        <Button variant="destructive" onClick={leave} className="w-full">
          <LogOut className="mr-2 size-4" /> Exit group
        </Button>
      </div>

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

const MessageTicks = ({
  message,
  groupMemberIds,
  currentUserId,
}: {
  message: GroupMessage;
  groupMemberIds: string[];
  currentUserId: string;
}) => {
  const recipientIds = groupMemberIds.filter((id) => id !== currentUserId);
  const deliveredTo = message.deliveredTo ?? [message.senderId];
  const readBy = message.readBy ?? [message.senderId];
  const deliveredToAll = recipientIds.length > 0 && recipientIds.every((id) => deliveredTo.includes(id));
  const seenByAll = recipientIds.length > 0 && recipientIds.every((id) => readBy.includes(id));

  if (seenByAll) return <CheckCheck className="size-3.5 text-sky-300" />;
  if (deliveredToAll) return <CheckCheck className="size-3.5" />;
  return <Check className="size-3.5" />;
};

const MessageInfoDialog = ({
  message,
  members,
  currentUserId,
  onOpenChange,
}: {
  message?: GroupMessage;
  members: User[];
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const deliveredTo = message?.deliveredTo ?? [];
  const readBy = message?.readBy ?? [];
  const otherMembers = members.filter((member) => member.id !== currentUserId);
  const seenMembers = otherMembers.filter((member) => readBy.includes(member.id));
  const deliveredMembers = otherMembers.filter((member) => deliveredTo.includes(member.id) && !readBy.includes(member.id));
  const waitingMembers = otherMembers.filter((member) => !deliveredTo.includes(member.id));

  return (
    <Dialog open={Boolean(message)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
        <DialogHeader><DialogTitle>Message info</DialogTitle></DialogHeader>
        {message && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary-soft p-3 text-sm">
              <p className="whitespace-pre-wrap break-words font-medium">{message.content}</p>
              <p className="mt-1 text-[10px] font-bold text-muted-foreground">{formatClockTime24(message.createdAt)}</p>
            </div>
            <ReceiptSection title="Seen by" users={seenMembers} detail="Seen" />
            <ReceiptSection title="Delivered to" users={deliveredMembers} detail="Delivered" />
            <ReceiptSection title="Not delivered yet" users={waitingMembers} detail="Waiting" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ReceiptSection = ({ title, users, detail }: { title: string; users: User[]; detail: string }) => (
  <section className="space-y-2">
    <h3 className="text-sm font-black">{title}</h3>
    {users.length === 0 ? (
      <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">No one yet.</div>
    ) : (
      users.map((user) => <PersonRow key={user.id} username={user.username} detail={detail} />)
    )}
  </section>
);

const UnreadBadge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
};

const groupDraftKey = (userId: string, groupId: string) => `taskmates_group_draft_${userId}_${groupId}`;

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
