import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Bell, Clock3, Database, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";

const LandingPage = () => {
  const { currentUser } = useApp();

  if (currentUser) return <Navigate to="/dashboard" replace />;

  return (
    <main className="min-h-dvh bg-background text-foreground overflow-hidden relative">
      {/* Decorative Blobs */}
      <div className="absolute -left-20 -top-20 -z-10 size-60 rounded-full bg-primary/10 blur-[80px] dark:bg-primary/5" />
      <div className="absolute -right-20 -bottom-20 -z-10 size-60 rounded-full bg-accent/15 blur-[80px] dark:bg-accent/5" />
      <div className="absolute left-1/3 top-1/2 -z-10 size-40 rounded-full bg-emerald-500/10 blur-[80px] dark:bg-emerald-500/5" />

      <section className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-7 flex size-16 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
          <Clock3 className="size-8" />
        </div>
        <h1 className="text-4xl font-black leading-tight">TaskMates</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          A smart community-driven task and activity platform for posting tasks, tracking progress, collaborating with others, and staying productive anytime.
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 text-sm">
          <Feature icon={WifiOff} text="Offline ready" color="text-rose-500" />
          <Feature icon={Bell} text="Local reminders" color="text-amber-500" />
          <Feature icon={Database} text="Queued sync" color="text-blue-500" />
          <Feature icon={Clock3} text="24h coverage" color="text-emerald-500" />
        </div>
        <div className="mt-8 grid gap-3">
          <Button asChild size="lg">
            <Link to="/register">Create account <ArrowRight className="ml-1 size-4" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
};

const Feature = ({ icon: Icon, text, color = "text-primary" }: { icon: typeof WifiOff; text: string; color?: string }) => (
  <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
    <Icon className={`mb-2 size-4 ${color}`} />
    <p className="font-bold">{text}</p>
  </div>
);

export default LandingPage;
