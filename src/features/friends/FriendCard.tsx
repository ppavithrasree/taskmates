import { Link } from "react-router-dom";
import { Check, Clock, UserPlus, X } from "lucide-react";
import type { User } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";

interface Props {
  user: User;
  requestId?: string;
  context?: "search" | "incoming" | "outgoing" | "friend";
}

export const FriendCard = ({ user, requestId, context = "search" }: Props) => {
  const { sendRequest, respondRequest, getFriendshipStatus } = useApp();
  const status = getFriendshipStatus(user.id);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-soft transition-smooth hover:shadow-soft-lg">
      <Link to={`/profile/${user.username}`} className="shrink-0">
        <div className="flex size-12 items-center justify-center rounded-full bg-gradient-primary text-lg font-bold text-primary-foreground">
          {user.username.charAt(0).toUpperCase()}
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={`/profile/${user.username}`}>
          <p className="truncate font-semibold tracking-tight transition-smooth hover:text-primary">
            {user.username}
          </p>
        </Link>
        {user.bio && <p className="truncate text-xs text-muted-foreground">{user.bio}</p>}
      </div>

      {context === "incoming" && requestId ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-full bg-success text-success-foreground hover:bg-success/90"
            onClick={() => respondRequest(requestId, true)}
          >
            <Check className="mr-1 size-4" /> Accept
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={() => respondRequest(requestId, false)}
            aria-label={`Decline request from ${user.username}`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : status === "friends" ? (
        <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-success">
          Friends
        </span>
      ) : status === "outgoing" ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <Clock className="size-3" /> Pending
        </span>
      ) : status === "incoming" ? (
        <span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-accent">
          Request
        </span>
      ) : status === "self" ? null : (
        <Button size="sm" className="rounded-full shadow-soft" onClick={() => sendRequest(user.id)}>
          <UserPlus className="mr-1 size-4" /> Add
        </Button>
      )}
    </div>
  );
};

export default FriendCard;
