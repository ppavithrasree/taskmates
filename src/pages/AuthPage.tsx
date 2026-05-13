import { ReactNode, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Activity, Eye, EyeOff } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { hasFirebaseConfig } from "@/lib/firebaseSync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  mode: "login" | "register";
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);

const AuthPage = ({ mode }: Props) => {
  const { currentUser, login, register, online } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (currentUser) return <Navigate to="/dashboard" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    let result;
    try {
      result = mode === "login" ? await login(username, password) : await register(username, password, confirmPassword);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : "Authentication failed. Please try again.",
      };
    } finally {
      setBusy(false);
    }

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === "login" ? "Welcome back." : "Account created.");
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background px-4 py-8">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 -top-20 size-64 rounded-full bg-primary/15 blur-3xl animate-float" />
        <div className="absolute -bottom-16 -right-16 size-56 rounded-full bg-accent/15 blur-3xl" style={{ animationDelay: "1.5s" }} />
        <div className="absolute left-1/2 top-1/3 size-40 rounded-full bg-success/10 blur-3xl animate-float" style={{ animationDelay: "0.8s" }} />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="relative">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Activity className="size-7" />
            </span>
            <span className="absolute -inset-1 rounded-2xl bg-gradient-primary opacity-20 blur-md animate-pulse" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">TaskMates</h1>
          <p className="text-sm text-muted-foreground">Track your progress. Share your journey.</p>
        </div>

        {/* Auth Card */}
        <section className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-soft-lg backdrop-blur-xl animate-scale-in">
          <h2 className="text-2xl font-black tracking-tight">{mode === "login" ? "Welcome back" : "Get started"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to continue your journey."
              : "Create your account to start tracking."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Enter your username"
                className="h-12 rounded-xl bg-background/80 backdrop-blur-sm border-border/60 transition-all duration-200 focus:border-primary/50 focus:shadow-md"
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="Enter password"
                  className="h-12 rounded-xl bg-background/80 backdrop-blur-sm border-border/60 pr-10 transition-all duration-200 focus:border-primary/50 focus:shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {mode === "register" && (
              <Field label="Confirm password">
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    className="h-12 rounded-xl bg-background/80 backdrop-blur-sm border-border/60 pr-10 transition-all duration-200 focus:border-primary/50 focus:shadow-md"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
            )}
            <Button className="h-12 w-full rounded-xl bg-gradient-primary text-base font-bold shadow-glow hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" type="submit" disabled={busy}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Working...
                </span>
              ) : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>New here? <Link to="/register" className="font-bold text-primary hover:text-accent transition-colors">Create one</Link></>
            ) : (
              <>Already logging? <Link to="/login" className="font-bold text-primary hover:text-accent transition-colors">Sign in</Link></>
            )}
          </p>
        </section>

        {!hasFirebaseConfig && (
          <p className="mt-5 text-center text-xs text-muted-foreground animate-fade-in-up">Demo users: aria, maya, julian. Password: demo.</p>
        )}
      </div>
    </main>
  );
};

export default AuthPage;
