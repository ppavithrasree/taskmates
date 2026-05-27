import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, Clock3, Heart, MessageCircle, MessageSquare, SmilePlus, UserCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import { formatDayAwareDateTime } from "@/lib/dateTime";
import type { AppNotification } from "@/types";

const iconMap: Record<AppNotification["type"], typeof Bell> = {
  connection_request: UserPlus,
  connection_accepted: UserCheck,
  unlogged_gaps: Clock3,
  group_message: MessageSquare,
  group_reaction: SmilePlus,
  post_like: Heart,
  post_comment: MessageCircle,
};

const toneMap: Record<AppNotification["type"], string> = {
  connection_request: "bg-primary-soft text-primary",
  connection_accepted: "bg-success-soft text-success",
  unlogged_gaps: "bg-accent-soft text-accent",
  group_message: "bg-primary-soft text-primary",
  group_reaction: "bg-accent-soft text-accent",
  post_like: "bg-destructive/10 text-destructive",
  post_comment: "bg-success-soft text-success",
};

const Notifications = () => {
  const { notifications, settings, markNotificationsRead, deleteNotification } = useApp();
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const swipeRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const visibleNotifications = notifications.filter(
    (item) => item.type !== "group_message" && item.type !== "group_reaction"
  );

  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  return (
    <AppShell title="Notifications">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-primary" />
          <h1 className="text-2xl font-black">Notifications</h1>
        </div>

        {visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <BellOff className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <section className="space-y-2">
            {visibleNotifications.map((notif) => {
              const Icon = iconMap[notif.type] ?? Bell;
              const tone = toneMap[notif.type] ?? "bg-muted text-muted-foreground";
              const inner = (
                <div
                  className={`tap-lift flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-soft transition-smooth hover:border-primary/30 ${swipingId === notif.id ? "translate-x-3 opacity-80" : ""}`}
                  style={{ touchAction: "pan-y" }}
                  onPointerDown={(event) => {
                    swipeRef.current = { id: notif.id, x: event.clientX, y: event.clientY };
                    setSwipingId(notif.id);
                  }}
                  onPointerUp={(event) => {
                    const start = swipeRef.current;
                    swipeRef.current = null;
                    setSwipingId(null);
                    if (!start || start.id !== notif.id) return;
                    const dx = event.clientX - start.x;
                    const dy = Math.abs(event.clientY - start.y);
                    if (Math.abs(dx) > 70 && dy < 45) deleteNotification(notif.id);
                  }}
                  onPointerCancel={() => {
                    swipeRef.current = null;
                    setSwipingId(null);
                  }}
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{notif.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{notif.body}</p>
                    <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                      {formatDayAwareDateTime(notif.createdAt, settings.timeFormat)}
                    </p>
                  </div>
                </div>
              );
              return notif.link ? (
                <Link key={notif.id} to={notif.link}>{inner}</Link>
              ) : (
                <div key={notif.id}>{inner}</div>
              );
            })}
          </section>
        )}
      </div>
    </AppShell>
  );
};

export default Notifications;
