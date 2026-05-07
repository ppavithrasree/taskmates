import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/context/AppContext";
import { setActivePushPath } from "@/lib/pushNotifications";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Friends from "./pages/Friends.tsx";
import Groups from "./pages/Groups.tsx";
import Profile from "./pages/Profile.tsx";
import Settings from "./pages/Settings.tsx";
import Notifications from "./pages/Notifications.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const backTargetFor = (pathname: string) => {
  if (/^\/groups\/[^/]+(?:\/info)?$/.test(pathname)) return "/groups";
  if (
    pathname === "/friends" ||
    pathname === "/groups" ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/settings" ||
    pathname === "/notifications"
  ) {
    return "/dashboard";
  }
  return null;
};

const BackRouteController = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathRef = useRef(location.pathname);
  const lastExitPromptRef = useRef(0);

  useEffect(() => {
    pathRef.current = location.pathname;
    setActivePushPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const onPopState = () => {
      if (document.querySelector('[role="dialog"]')) return;
      const target = backTargetFor(pathRef.current);
      if (!target) return;
      window.setTimeout(() => {
        if (window.location.pathname !== target) navigate(target, { replace: true });
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
        if (document.querySelector('[role="dialog"]')) return;

        const pathname = pathRef.current;
        const target = backTargetFor(pathname);
        if (target) {
          navigate(target, { replace: true });
          return;
        }

        if (pathname === "/dashboard" || pathname === "/") {
          const now = Date.now();
          if (now - lastExitPromptRef.current < 2000) {
            App.exitApp();
            return;
          }
          lastExitPromptRef.current = now;
          toast("Do again to exit.");
          return;
        }

        if (canGoBack) {
          window.history.back();
          return;
        }

        navigate("/dashboard", { replace: true });
      }).then((handle) => {
        remove = () => handle.remove();
      });
    });

    return () => remove?.();
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
