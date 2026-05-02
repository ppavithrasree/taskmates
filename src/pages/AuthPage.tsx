import { ReactNode, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  mode: "login" | "register";
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </label>
    {children}
  </div>
);

const AuthPage = ({ mode }: Props) => {
  const { currentUser, login, register } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  if (currentUser) return <Navigate to="/dashboard" replace />;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = mode === "login" ? login(username, password) : register(username, password);

    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return;
    }

    toast.success(mode === "login" ? "Welcome back." : "Welcome to TaskMates.");
    navigate("/dashboard");
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-mesh" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 sm:px-6">
        <Logo className="mb-10 justify-center" />

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to keep your streak and feed moving."
              : "Pick a username, invite friends, and start logging progress."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-soft-lg">
          <Field label="Username">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="aria"
              autoComplete="username"
              maxLength={32}
              className="h-11 rounded-lg"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="demo"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={64}
              className="h-11 rounded-lg"
            />
          </Field>
          <Button type="submit" className="h-11 w-full rounded-full shadow-glow">
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                New here?{" "}
                <Link to="/register" className="font-semibold text-primary hover:underline">
                  Register
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Demo account: <span className="font-mono font-semibold">aria</span> /{" "}
          <span className="font-mono font-semibold">demo</span>. Data stays in local storage.
        </p>
      </main>
    </div>
  );
};

export default AuthPage;
