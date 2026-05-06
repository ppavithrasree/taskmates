import { ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import { Bell, LayoutDashboard, LogOut, Search, Settings, User, UsersRound } from "lucide-react";
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
    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-black text-destructive-foreground shadow-sm">
      {count > 9 ? "9+" : count}
    </span>
  );
};

export const AppShell = ({ children, title }: { children: ReactNode; title?: string }) => {
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
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="block size-2.5 rounded-full bg-gradient-primary shadow-glow" />
            <h1 className="text-base font-bold">{title ?? "TaskMates"}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} aria-label="Notifications" className="relative">
              <Bell className="size-4" />
              <Badge count={unreadNotificationCount} />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Logout">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="animate-fade-in-up pb-24">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={({ isActive }) =>
                cn("relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-smooth", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground")
              }
            >
              <div className="relative">
                <item.icon className="size-5" />
                {item.badgeKey && <Badge count={badgeCounts[item.badgeKey] ?? 0} />}
              </div>
              {item.title}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppShell;
