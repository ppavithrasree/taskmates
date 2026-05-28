import { ReactNode } from "react";
import { NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Bell, ClipboardList, LayoutDashboard, LogOut, Search, Settings, User, UsersRound, Download } from "lucide-react";
import { TaskMateAIProvider } from "@/features/ai/TaskMateAIProvider";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useOtaUpdate } from "@/hooks/useOtaUpdate";

const navItems = [
  { title: "Feed", url: "/dashboard", icon: LayoutDashboard, badgeKey: null, color: "text-teal-500" },
  { title: "Search", url: "/friends", icon: Search, badgeKey: "pendingRequestCount" as const, color: "text-purple-500" },
  { title: "Groups", url: "/groups", icon: UsersRound, badgeKey: "unreadGroupCount" as const, color: "text-emerald-500" },
  { title: "Profile", url: "/profile", icon: User, badgeKey: null, color: "text-amber-500" },
  { title: "Settings", url: "/settings", icon: Settings, badgeKey: null, color: "text-slate-500" },
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
  const location = useLocation();
  const { forceRequired, updateAvailable, updateInfo, downloadUpdate } = useOtaUpdate();

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
            {updateAvailable && (
              <Button
                variant="ghost"
                size="icon"
                onClick={downloadUpdate}
                aria-label="Download update"
                className="relative size-9 rounded-md bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white animate-pulse shadow-sm"
              >
                <Download className="size-[18px]" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} aria-label="Notifications" className="relative size-9 rounded-md text-amber-500 hover:bg-amber-500/10 hover:text-amber-600 transition-smooth">
              <Bell className="size-[18px]" />
              <Badge count={unreadNotificationCount} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/tasks")} aria-label="My tasks" className="size-9 rounded-md text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 transition-smooth">
              <ClipboardList className="size-[18px]" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Logout" className="size-9 rounded-md text-destructive hover:bg-destructive/10 hover:text-red-600 transition-smooth">
              <LogOut className="size-[18px]" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main key={location.pathname} className={cn("page-transition pb-24", mainClassName)}>{children}</main>
      <TaskMateAIProvider />
      <Dialog open={forceRequired} onOpenChange={() => undefined}>
        <DialogContent
          className="max-w-md rounded-2xl border border-border/80 bg-card/95 p-6 shadow-soft-lg backdrop-blur-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive animate-pulse">
              <Download className="size-6" />
            </div>
            <DialogTitle className="text-xl font-black tracking-tight text-foreground">Update Required</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Version {updateInfo?.version} is required to continue using TaskMates.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {updateInfo?.releaseNotes && (
              <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-muted/50 p-4 text-xs font-semibold leading-relaxed text-muted-foreground">
                <p className="mb-1 font-bold text-foreground">Release notes</p>
                {updateInfo.releaseNotes}
              </div>
            )}
            <Button onClick={downloadUpdate} className="h-11 w-full bg-gradient-primary font-bold shadow-glow">
              Update Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    <item.icon className={cn("size-[20px] transition-all duration-200", isActive ? item.color : "text-muted-foreground", isActive && "drop-shadow-sm")} />
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
