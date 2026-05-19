import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, ErrorInfo, ReactNode, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import { clearDeliveredLocalNotifications } from "@/lib/notifications";
import { clearDeliveredPushNotifications, pathForNotification, setActivePushPath, setPushNotificationNavigationHandler } from "@/lib/pushNotifications";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Friends from "./pages/Friends.tsx";
import Groups from "./pages/Groups.tsx";
import Profile from "./pages/Profile.tsx";
import Settings from "./pages/Settings.tsx";
import Notifications from "./pages/Notifications.tsx";
import MyTasks from "./pages/MyTasks.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
        <section className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-center shadow-soft">
          <h1 className="text-lg font-black">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">The app recovered from a display error.</p>
          <button
            type="button"
            className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            onClick={() => this.setState({ hasError: false })}
          >
            Continue
          </button>
        </section>
      </main>
    );
  }
}

const backTargetFor = (path: string) => {
  const [pathname, search = ""] = path.split("?");
  if (pathname === "/dashboard" && search) return "/dashboard";
  if (/^\/groups\/[^/]+(?:\/info)?$/.test(pathname)) return "/groups";
  if (
    pathname === "/friends" ||
    pathname === "/groups" ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/settings" ||
    pathname === "/notifications" ||
    pathname === "/tasks"
  ) {
    return "/dashboard";
  }
  return null;
};

const BackRouteController = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const pathRef = useRef(location.pathname);

  const closeTopDialog = () => {
    if (!document.querySelector('[role="dialog"]')) return false;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  };

  useEffect(() => {
    pathRef.current = `${location.pathname}${location.search}`;
    setActivePushPath(location.pathname);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    const target = backTargetFor(`${location.pathname}${location.search}`);
    if (target && `${location.pathname}${location.search}` !== target) {
      navigate(target, { replace: true });
    }
  }, [location.pathname, location.search, navigationType, navigate]);

  useEffect(() => {
    setPushNotificationNavigationHandler((path) => navigate(path || "/dashboard"));
    return () => setPushNotificationNavigationHandler(null);
  }, [navigate]);

  useEffect(() => {
    const onPopState = () => {
      if (closeTopDialog()) return;
      const target = backTargetFor(pathRef.current);
      if (!target) return;
      window.setTimeout(() => {
        if (`${window.location.pathname}${window.location.search}` !== target) navigate(target, { replace: true });
      }, 0);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;

    import("@capacitor/app").then(({ App }) => {
      App.addListener("backButton", ({ canGoBack }) => {
        if (closeTopDialog()) return;

        const pathname = pathRef.current;
        const target = backTargetFor(pathname);
        if (target) {
          navigate(target, { replace: true });
          return;
        }

        if (pathname === "/dashboard" || pathname === "/") {
          App.exitApp();
          return;
        }

        navigate("/dashboard", { replace: true });
      }).then((handle) => {
        remove = () => handle.remove();
      });
    });

    return () => remove?.();
  }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeAppState: (() => void) | undefined;
    let removeLocalAction: (() => void) | undefined;

    const clearDelivered = () => {
      void clearDeliveredPushNotifications();
      void clearDeliveredLocalNotifications();
    };

    clearDelivered();

    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) clearDelivered();
      }).then((handle) => {
        removeAppState = () => handle.remove();
      });
    });

    import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        const extra = action.notification.extra as { type?: string; link?: string } | undefined;
        navigate(pathForNotification(extra));
        clearDelivered();
      }).then((handle) => {
        removeLocalAction = () => handle.remove();
      });
    });

    return () => {
      removeAppState?.();
      removeLocalAction?.();
    };
  }, [navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppProvider>
          <BackRouteController />
          <AppErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:groupId" element={<Groups />} />
              <Route path="/groups/:groupId/:mode" element={<Groups />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:username" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/tasks" element={<MyTasks />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppErrorBoundary>
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
