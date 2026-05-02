import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Flame, Globe, Lock, Search, Users } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

const previewTasks = [
  { user: "aria", title: "Shipped the client wireframes", tag: "Public", icon: Globe },
  { user: "julian", title: "Finished 45 minutes of focused writing", tag: "Custom", icon: Users },
  { user: "elena", title: "Reviewed sprint notes before lunch", tag: "Private", icon: Lock },
];

const features = [
  {
    icon: CheckCircle2,
    title: "Log real progress",
    body: "Add, edit, and delete tasks with quick notes so the day has a clean record.",
  },
  {
    icon: Search,
    title: "Find your people",
    body: "Search usernames, send requests, and build a small circle for accountability.",
  },
  {
    icon: Lock,
    title: "Share with control",
    body: "Choose public, private, or custom visibility for every task you publish.",
  },
  {
    icon: Flame,
    title: "See momentum",
    body: "Track today's work, total wins, friends, and profile streaks from one mobile-first dashboard.",
  },
];

const LandingPage = () => (
  <div className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="rounded-full shadow-soft">
            <Link to="/register">Get started</Link>
          </Button>
        </div>
      </nav>
    </header>

    <main>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 lg:grid-cols-[1fr_0.86fr] lg:items-center lg:pt-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
              <Users className="size-3.5" />
              Social productivity with privacy built in
            </div>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              TaskMates helps friends stay consistent together.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Track completed work, share selected wins, and keep your productivity circle close
              without turning every task into a broadcast.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full shadow-glow">
                <Link to="/register">
                  Create account <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full bg-card">
                <Link to="/login">Try demo login</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-soft-lg">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Live feed
                </p>
                <h2 className="text-xl font-bold">Today's wins</h2>
              </div>
              <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                8 done
              </span>
            </div>
            <div className="space-y-3">
              {previewTasks.map((task) => (
                <article key={task.title} className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                        {task.user.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold">{task.user}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                      <task.icon className="size-3" />
                      {task.tag}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{task.title}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-lg border border-border bg-card p-5 shadow-soft">
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <feature.icon className="size-5" />
            </div>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>
    </main>

    <footer className="border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
      TaskMates demo app. Local browser storage only.
    </footer>
  </div>
);

export default LandingPage;
