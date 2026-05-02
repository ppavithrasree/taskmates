import { ReactNode } from "react";
import { Link, Navigate, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, User, Users } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Friends", url: "/friends", icon: Users },
  { title: "Profile", url: "/profile", icon: User },
];

interface Props {
  children: ReactNode;
  title?: string;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-smooth",
    isActive
      ? "bg-primary-soft text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );

export const AppShell = ({ children, title }: Props) => {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();

  if (!currentUser) return <Navigate to="/login" replace />;

  const signOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card px-4 py-5 lg:flex lg:flex-col">
        <Logo to="/dashboard" />
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.url} to={item.url} className={linkClass}>
              <item.icon className="size-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <Link to="/profile" className="mb-3 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
            <div className="flex size-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold capitalize">{currentUser.username}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:h-16">
          <div className="flex items-center gap-3">
            <Logo to="/dashboard" compact className="lg:hidden" />
            {title && <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>}
          </div>
          <Button variant="ghost" size="icon" className="rounded-full lg:hidden" onClick={signOut} aria-label="Logout">
            <LogOut className="size-4" />
          </Button>
        </header>

        <main className="pb-24 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-soft-lg backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-smooth",
                  isActive ? "bg-primary-soft text-primary" : "text-muted-foreground"
                )
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
