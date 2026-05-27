import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Bell, Clock3, Database, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";

const LandingPage = () => {
  const { currentUser } = useApp();

  if (currentUser) return <Navigate to="/dashboard" replace />;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-7 flex size-16 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
          <Clock3 className="size-8" />
        </div>
        <h1 className="text-4xl font-black leading-tight">TaskMates</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          A smart community-driven task and activity platform for posting tasks, tracking progress, collaborating with others, and staying productive anytime.
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 text-sm">
          <Feature icon={WifiOff} text="Offline ready" />
          <Feature icon={Bell} text="Local reminders" />
          <Feature icon={Database} text="Queued sync" />
          <Feature icon={Clock3} text="24h coverage" />
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

const Feature = ({ icon: Icon, text }: { icon: typeof WifiOff; text: string }) => (
  <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
    <Icon className="mb-2 size-4 text-primary" />
    <p className="font-bold">{text}</p>
  </div>
);

export default LandingPage;
