import { ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clock3 } from "lucide-react";
import type { Post, Visibility } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  initial?: Post;
  onClose?: () => void;
  onSaved?: () => void;
}

interface DateParts {
  date: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
}

const toParts = (timestamp: number): DateParts => {
  const date = new Date(timestamp);
  return {
    date: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
    hour: String(date.getHours()).padStart(2, "0"),
    minute: String(date.getMinutes()).padStart(2, "0"),
  };
};

const fromParts = (parts: DateParts) =>
  new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.date),
    Number(parts.hour),
    Number(parts.minute),
    0,
    0
  ).getTime();

export const PostForm = ({ initial, onClose, onSaved }: Props) => {
  const { currentUser, users, addPost, updatePost, getAcceptedConnectionIds } = useApp();
  const [startParts, setStartParts] = useState(() => toParts(initial?.startTime ?? Date.now() - 30 * 60_000));
  const [endParts, setEndParts] = useState(() => toParts(initial?.endTime ?? Date.now()));
  const [content, setContent] = useState(initial?.content ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? currentUser?.privacy ?? "public");
  const [customUsernames, setCustomUsernames] = useState<string[]>(initial?.customUsernames ?? currentUser?.customUsernames ?? []);

  const connectedIds = currentUser ? getAcceptedConnectionIds(currentUser.id) : [];
  const connections = users.filter((u) => connectedIds.includes(u.id));
  const nowParts = useMemo(() => toParts(Date.now()), []);

  const updatePart = (side: "start" | "end", key: keyof DateParts, value: string) => {
    const clean = value.replace(/\D/g, "").slice(0, key === "year" ? 4 : 2);
    const setter = side === "start" ? setStartParts : setEndParts;
    setter((parts) => ({ ...parts, [key]: clean }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      startTime: fromParts(startParts),
      endTime: fromParts(endParts),
      content,
      visibility,
      customUsernames: visibility === "custom" ? customUsernames : undefined,
    };
    const result = initial ? updatePost(initial.id, payload) : addPost(payload);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(initial ? "Activity updated." : "Activity saved.");
    onSaved?.();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-lg border border-border bg-gradient-soft p-3 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-black">
            <CalendarDays className="size-4 text-primary" />
            Time range
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 bg-card text-xs" onClick={() => setEndParts(toParts(Date.now()))}>
            Use current time
          </Button>
        </div>
        <div className="space-y-4">
          <TimeGrid label="Start" parts={startParts} onChange={(key, value) => updatePart("start", key, value)} maxParts={nowParts} />
          <TimeGrid label="End" parts={endParts} onChange={(key, value) => updatePart("end", key, value)} maxParts={nowParts} />
        </div>
      </div>

      <Field label="Activity story">
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={9}
          maxLength={5000}
          placeholder="Write the whole story of this block, or even your full day."
          className="min-h-56 resize-y rounded-lg bg-background text-base leading-relaxed"
        />
      </Field>

      <Field label="Visibility">
        <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
          <SelectTrigger className="h-12 rounded-lg bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="connections">Connections</SelectItem>
            <SelectItem value="custom">Custom usernames</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {visibility === "custom" && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Allowed usernames</p>
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Connect with people first, then choose who can read this post.</p>
          ) : (
            connections.map((connection) => (
              <label key={connection.id} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={customUsernames.includes(connection.username)}
                  onCheckedChange={(checked) =>
                    setCustomUsernames((items) =>
                      checked ? [...items, connection.username] : items.filter((item) => item !== connection.username)
                    )
                  }
                />
                {connection.username}
              </label>
            ))
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onClose && <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>}
        <Button type="submit">Save activity</Button>
      </div>
    </form>
  );
};

const TimeGrid = ({
  label,
  parts,
  onChange,
}: {
  label: string;
  parts: DateParts;
  maxParts: DateParts;
  onChange: (key: keyof DateParts, value: string) => void;
}) => (
  <section>
    <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
      <Clock3 className="size-3.5 text-accent" />
      {label}
    </p>
    <div className="grid grid-cols-5 gap-2">
      <PartInput label="Date" value={parts.date} onChange={(value) => onChange("date", value)} min={1} max={31} />
      <PartInput label="Month" value={parts.month} onChange={(value) => onChange("month", value)} min={1} max={12} />
      <PartInput label="Year" value={parts.year} onChange={(value) => onChange("year", value)} min={1970} max={9999} className="col-span-1" />
      <PartInput label="Hour" value={parts.hour} onChange={(value) => onChange("hour", value)} min={0} max={23} />
      <PartInput label="Minute" value={parts.minute} onChange={(value) => onChange("minute", value)} min={0} max={59} />
    </div>
  </section>
);

const PartInput = ({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  className?: string;
}) => (
  <label className={className}>
    <span className="mb-1 block text-center text-[10px] font-black uppercase text-muted-foreground">{label}</span>
    <Input
      inputMode="numeric"
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 rounded-lg bg-background px-1 text-center text-sm font-black tabular-nums sm:text-base"
    />
  </label>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-2">
    <label className="text-xs font-bold uppercase text-muted-foreground">{label}</label>
    {children}
  </div>
);

export default PostForm;
