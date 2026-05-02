import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Globe, Lock, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaskForm } from "./TaskForm";

const formatTime = (timestamp: number) => {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
};

const formatExactTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const visibility = {
  public: { icon: Globe, label: "Public", classes: "bg-primary-soft text-primary" },
  private: { icon: Lock, label: "Private", classes: "bg-muted text-muted-foreground" },
  custom: { icon: Users, label: "Custom", classes: "bg-accent-soft text-accent" },
} as const;

export const TaskCard = ({ task }: { task: Task }) => {
  const { currentUser, users, deleteTask } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const author = users.find((user) => user.id === task.authorId);
  const isMine = currentUser?.id === task.authorId;
  const VisibilityIcon = visibility[task.visibility].icon;

  return (
    <article className="animate-fade-in-up rounded-lg border border-border bg-card p-4 shadow-soft transition-smooth hover:shadow-soft-lg sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <Link to={author ? `/profile/${author.username}` : "#"} className="group flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
            {author?.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold transition-smooth group-hover:text-primary">
              {author?.username ?? "unknown"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatExactTime(task.completedAt)} · {formatTime(task.completedAt)}
            </p>
          </div>
        </Link>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${visibility[task.visibility].classes}`}
        >
          <VisibilityIcon className="size-3" />
          {visibility[task.visibility].label}
        </span>
      </header>

      <div className="mb-2 flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={2.5} />
        <h3 className="text-base font-semibold leading-snug sm:text-lg">{task.title}</h3>
      </div>

      {task.description && (
        <p className="pl-8 text-sm leading-relaxed text-muted-foreground">{task.description}</p>
      )}

      {isMine && (
        <footer className="mt-4 flex items-center gap-1 border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground hover:bg-primary-soft hover:text-primary"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1 size-3.5" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-1 size-3.5" /> Delete
          </Button>
        </footer>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit task</DialogTitle>
          </DialogHeader>
          <TaskForm initial={task} onClose={() => setEditOpen(false)} onSaved={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>This removes it from your profile and feed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteTask(task.id);
                toast.success("Task removed.");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
};

export default TaskCard;
