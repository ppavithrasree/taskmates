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
    <label className="text-xs font-bold uppercase text-muted-foreground">{label}</label>
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
    navigate("/dashboard");
  };

  return (
    <main className="min-h-dvh bg-gradient-soft px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8 flex items-center justify-center gap-2 text-2xl font-black">
          <span className="flex size-11 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
            <Activity className="size-5" />
          </span>
          TaskMates
        </div>

        <section className="rounded-lg border border-border bg-card p-6 shadow-soft-lg">
          <h1 className="text-2xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {online ? "Firebase sync is available when configured." : "You are offline. Local mode is ready."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Username">
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="John Doe"
                className="h-11 rounded-lg bg-background"
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
                  className="h-11 rounded-lg bg-background pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                    className="h-11 rounded-lg bg-background pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
            )}
            <Button className="h-11 w-full" type="submit" disabled={busy}>
              {busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>New here? <Link to="/register" className="font-semibold text-primary">Create one</Link></>
            ) : (
              <>Already logging? <Link to="/login" className="font-semibold text-primary">Sign in</Link></>
            )}
          </p>
        </section>

        {!hasFirebaseConfig && (
          <p className="mt-5 text-center text-xs text-muted-foreground">Demo users: aria, maya, julian. Password: demo.</p>
        )}
      </div>
    </main>
  );
};

export default AuthPage;
