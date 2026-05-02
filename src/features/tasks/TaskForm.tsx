import { useState } from "react";
import { toast } from "sonner";
import type { Task, Visibility } from "@/types";
import { useApp } from "@/context/AppContext";
import { PrivacySelector } from "@/features/privacy/PrivacySelector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  initial?: Task;
  onClose?: () => void;
  onSaved?: () => void;
}

export const TaskForm = ({ initial, onClose, onSaved }: Props) => {
  const { currentUser, addTask, updateTask, getFriends } = useApp();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [completedAt, setCompletedAt] = useState(() => toDateTimeLocal(initial?.completedAt ?? Date.now()));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "public");
  const [customIds, setCustomIds] = useState<string[]>(initial?.customFriendIds ?? []);

  const friends = currentUser ? getFriends(currentUser.id) : [];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const completedTimestamp = new Date(completedAt).getTime();

    if (cleanTitle.length < 2) {
      toast.error("Give your task a title.");
      return;
    }

    if (Number.isNaN(completedTimestamp)) {
      toast.error("Choose when you completed the task.");
      return;
    }

    if (initial) {
      updateTask(initial.id, {
        title: cleanTitle,
        description: cleanDescription || undefined,
        completedAt: completedTimestamp,
        visibility,
        customFriendIds: customIds,
      });
      toast.success("Task updated.");
    } else {
      addTask({
        title: cleanTitle,
        description: cleanDescription || undefined,
        completedAt: completedTimestamp,
        visibility,
        customFriendIds: customIds,
      });
      toast.success("Task logged.");
    }

    onSaved?.();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Task
        </label>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What did you finish?"
          maxLength={120}
          className="rounded-lg bg-background"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Note <span className="font-normal normal-case tracking-normal">(optional)</span>
        </label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add context, blockers, or a small win."
          maxLength={500}
          rows={3}
          className="resize-none rounded-lg bg-background"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Completed at
        </label>
        <Input
          type="datetime-local"
          value={completedAt}
          onChange={(event) => setCompletedAt(event.target.value)}
          className="rounded-lg bg-background"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Privacy
        </label>
        <PrivacySelector value={visibility} onChange={setVisibility} />
      </div>

      {visibility === "custom" && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Share with
          </p>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add friends first, then choose who can see this task.
            </p>
          ) : (
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {friends.map((friend) => {
                const checked = customIds.includes(friend.id);

                return (
                  <label key={friend.id} className="flex cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setCustomIds((ids) =>
                          next ? [...ids, friend.id] : ids.filter((id) => id !== friend.id)
                        )
                      }
                    />
                    <span className="text-sm">{friend.username}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onClose && (
          <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="rounded-full px-6">
          {initial ? "Save changes" : "Log task"}
        </Button>
      </div>
    </form>
  );
};

export default TaskForm;

const toDateTimeLocal = (timestamp: number) => {
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
};
