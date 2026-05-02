import { ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Search, Settings, User } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Feed", url: "/dashboard", icon: LayoutDashboard },
  { title: "Search", url: "/friends", icon: Search },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];

export const AppShell = ({ children, title }: { children: ReactNode; title?: string }) => {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();

  if (!currentUser) return <Navigate to="/login" replace />;

  const signOut = () => {
    logout();
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
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Logout">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="animate-fade-in-up pb-24">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={({ isActive }) =>
                cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-smooth", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground")
              }
            >
              <item.icon className="size-5" />
              {item.title}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppShell;
