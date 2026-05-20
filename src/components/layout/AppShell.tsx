import { ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import { Bell, ClipboardList, LayoutDashboard, LogOut, Search, Settings, User, UsersRound } from "lucide-react";
import { TaskMateAIProvider } from "@/features/ai/TaskMateAIProvider";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Feed", url: "/dashboard", icon: LayoutDashboard, badgeKey: null },
  { title: "Search", url: "/friends", icon: Search, badgeKey: "pendingRequestCount" as const },
  { title: "Groups", url: "/groups", icon: UsersRound, badgeKey: "unreadGroupCount" as const },
  { title: "Profile", url: "/profile", icon: User, badgeKey: null },
  { title: "Settings", url: "/settings", icon: Settings, badgeKey: null },
];

const Badge = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-pink-500 text-[9px] font-black text-white shadow-md animate-pop-in">
      {count > 9 ? "9+" : count}
    </span>
  );
};

export const AppShell = ({
  children,
  title,
  mainClassName,
}: {
  children: ReactNode;
  title?: string;
  mainClassName?: string;
}) => {
  const { currentUser, logout, unreadNotificationCount, pendingRequestCount, unreadGroupCount } = useApp();
  const navigate = useNavigate();

  if (!currentUser) return <Navigate to="/login" replace />;

  const badgeCounts: Record<string, number> = {
    pendingRequestCount,
    unreadGroupCount,
  };

  const signOut = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-dvh bg-background text-foreground transition-colors duration-300">
      {/* ── Top Header with Glassmorphism ── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative block size-2.5 rounded-full bg-gradient-primary shadow-glow">
              <span className="absolute inset-0 rounded-full bg-gradient-primary animate-ping opacity-40" />
            </span>
            <h1 className="truncate text-base font-bold tracking-tight">{title ?? "TaskMates"}</h1>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} aria-label="Notifications" className="relative size-9 rounded-md hover:bg-primary/10 transition-smooth">
              <Bell className="size-[18px]" />
              <Badge count={unreadNotificationCount} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/tasks")} aria-label="My tasks" className="size-9 rounded-md hover:bg-accent/10 transition-smooth">
              <ClipboardList className="size-[18px]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Logout" className="size-9 rounded-md hover:bg-destructive/10 transition-smooth">
              <LogOut className="size-[18px]" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className={cn("animate-fade-in-up pb-24", mainClassName)}>{children}</main>
      <TaskMateAIProvider />

      {/* ── Bottom Navigation with Glassmorphism ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-card/80 backdrop-blur-xl px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={({ isActive }) =>
                cn(
                  "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold transition-all duration-200",
                  isActive
                    ? "bg-primary/12 text-primary scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground active:scale-95"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <item.icon className={cn("size-[20px] transition-all duration-200", isActive && "drop-shadow-sm")} />
                    {item.badgeKey && <Badge count={badgeCounts[item.badgeKey] ?? 0} />}
                  </div>
                  <span className={cn("transition-all duration-200", isActive && "font-extrabold")}>{item.title}</span>
                  {isActive && (
                    <span className="absolute -bottom-0.5 h-[3px] w-6 rounded-full bg-gradient-primary animate-scale-in" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppShell;
