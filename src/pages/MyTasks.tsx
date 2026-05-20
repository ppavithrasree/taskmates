import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import { formatDayAwareDateTime } from "@/lib/dateTime";
import { loadLocalTasks, notificationIdForTask, saveLocalTasks, TASKS_CHANGED_EVENT, type LocalTask } from "@/lib/localTasks";
import { cancelTaskReminderNotification, scheduleTaskReminderNotification } from "@/lib/notifications";

type TaskDraft = {
  content: string;
  date: string;
  hour: string;
  minute: string;
  period: "am" | "pm";
  reminderEnabled: boolean;
};

const draftFromTask = (task?: LocalTask, format: "12" | "24" = "24"): TaskDraft => {
  const at = new Date(task?.reminderAt ?? Date.now() + 60 * 60_000);
  const hour24 = at.getHours();
  const hour = format === "12" ? ((hour24 + 11) % 12) + 1 : hour24;
  return {
    content: task?.content ?? "",
    date: at.toISOString().slice(0, 10),
    hour: String(hour).padStart(2, "0"),
    minute: String(at.getMinutes()).padStart(2, "0"),
    period: hour24 >= 12 ? "pm" : "am",
    reminderEnabled: Boolean(task?.reminderAt),
  };
};

const reminderFromDraft = (draft: TaskDraft, format: "12" | "24") => {
  if (!draft.reminderEnabled) return undefined;
  let hour = Number(draft.hour);
  const minute = Number(draft.minute);
  if (isNaN(hour) || isNaN(minute)) return undefined;
  if (format === "12") {
    hour %= 12;
    if (draft.period === "pm") hour += 12;
  }
  const [year, month, day] = draft.date.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined;
  const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return isNaN(ts) ? undefined : ts;
};

const MyTasks = () => {
  const { currentUser, settings } = useApp();
  const timeFormat = settings.timeFormat ?? "24";
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(undefined, timeFormat));
  const tasksJsonRef = useRef("[]");
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    tasksJsonRef.current = "";
    const loadTasks = () => {
      const loaded = loadLocalTasks(currentUser.id);
      const json = JSON.stringify(loaded);
      if (json === tasksJsonRef.current) return;
      tasksJsonRef.current = json;
      skipNextSaveRef.current = true;
      setTasks(loaded);
    };
    const onTasksChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === currentUser.id) loadTasks();
    };
    loadTasks();
    window.addEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    window.addEventListener("storage", loadTasks);
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
      window.removeEventListener("storage", loadTasks);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const json = JSON.stringify(tasks);
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      tasksJsonRef.current = json;
      return;
    }
    if (json === tasksJsonRef.current) return;
    tasksJsonRef.current = json;
    saveLocalTasks(currentUser.id, tasks);
  }, [currentUser, tasks]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || (a.reminderAt ?? a.createdAt) - (b.reminderAt ?? b.createdAt)),
    [tasks]
  );

  if (!currentUser) return null;

  const startNew = () => {
    setEditingId(null);
    setDraft(draftFromTask(undefined, timeFormat));
    setOpen(true);
  };

  const startEdit = (task: LocalTask) => {
    setEditingId(task.id);
    setDraft(draftFromTask(task, timeFormat));
    setOpen(true);
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.content.trim();
    if (!content) {
      toast.error("Type a task first.");
      return;
    }
    const reminderAt = reminderFromDraft(draft, timeFormat);
    if (draft.reminderEnabled && !reminderAt) {
      toast.error("Invalid reminder time.");
      return;
    }
    if (reminderAt && reminderAt <= Date.now()) {
      toast.error("Choose a future reminder time.");
      return;
    }
    const now = Date.now();
    const id = editingId ?? `task_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    const nextTask: LocalTask = {
      id,
      content,
      completed: tasks.find((task) => task.id === id)?.completed ?? false,
      reminderAt,
      createdAt: tasks.find((task) => task.id === id)?.createdAt ?? now,
      updatedAt: now,
    };
    setTasks((items) => editingId ? items.map((task) => task.id === editingId ? nextTask : task) : [nextTask, ...items]);
    await cancelTaskReminderNotification(notificationIdForTask(id));
    if (reminderAt) {
      await scheduleTaskReminderNotification(notificationIdForTask(id), "Task reminder", content, new Date(reminderAt), "/tasks");
    }
    setOpen(false);
    toast.success(editingId ? "Task updated." : "Task added.");
  };

  const deleteTask = async (task: LocalTask) => {
    setTasks((items) => items.filter((item) => item.id !== task.id));
    await cancelTaskReminderNotification(notificationIdForTask(task.id));
    toast.success("Task deleted.");
  };

  return (
    <AppShell title="My Tasks">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">My Tasks</h1>
          <Button size="icon" onClick={startNew} aria-label="Add task">
            <Plus className="size-4" />
          </Button>
        </div>

        {sortedTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No tasks yet.</div>
        ) : (
          <section className="space-y-2">
            {sortedTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => startEdit(task)}
                className="tap-lift flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-soft"
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border ${task.completed ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, completed: !item.completed, updatedAt: Date.now() } : item));
                  }}
                >
                  {task.completed && <Check className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`whitespace-pre-wrap break-words text-sm font-semibold ${task.completed ? "text-muted-foreground line-through" : ""}`}>{task.content}</p>
                  {task.reminderAt && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                      <Bell className="size-3.5" /> {formatDayAwareDateTime(task.reminderAt, timeFormat)}
                    </p>
                  )}
                </div>
                <Pencil className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <Trash2
                  className="mt-1 size-4 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteTask(task);
                  }}
                />
              </button>
            ))}
          </section>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
          <form onSubmit={saveTask} className="space-y-4">
            <Textarea value={draft.content} onChange={(event) => setDraft((item) => ({ ...item, content: event.target.value }))} rows={5} placeholder="Task" className="min-h-32 bg-background" />
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${draft.reminderEnabled ? "border-primary bg-primary-soft" : "border-border bg-card"}`}
              onClick={() => setDraft((item) => ({ ...item, reminderEnabled: !item.reminderEnabled }))}
            >
              <span className="flex items-center gap-2 text-sm font-bold"><Bell className="size-4" /> Reminder</span>
              <span className="text-xs font-bold">{draft.reminderEnabled ? "On" : "Off"}</span>
            </button>
            {draft.reminderEnabled && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <label className="col-span-2">
                  <span className="mb-1 block text-[10px] font-black uppercase text-muted-foreground">Date</span>
                  <Input type="date" value={draft.date} onChange={(event) => setDraft((item) => ({ ...item, date: event.target.value }))} className="h-11 bg-background" />
                </label>
                <TimeInput label="Hour" value={draft.hour} onChange={(value) => setDraft((item) => ({ ...item, hour: value }))} max={timeFormat === "12" ? 12 : 23} />
                <TimeInput label="Minute" value={draft.minute} onChange={(value) => setDraft((item) => ({ ...item, minute: value }))} max={59} />
                {timeFormat === "12" && (
                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase text-muted-foreground">AM/PM</span>
                    <Select value={draft.period} onValueChange={(value) => setDraft((item) => ({ ...item, period: value as "am" | "pm" }))}>
                      <SelectTrigger className="h-11 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="am">am</SelectItem>
                        <SelectItem value="pm">pm</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const TimeInput = ({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max: number }) => (
  <label>
    <span className="mb-1 block text-[10px] font-black uppercase text-muted-foreground">{label}</span>
    <Input inputMode="numeric" value={value} min={0} max={max} onChange={(event) => {
      const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
      const num = Number(raw);
      onChange(raw && num > max ? String(max).padStart(2, "0") : raw);
    }} className="h-11 bg-background text-center font-black" />
  </label>
);

export default MyTasks;
