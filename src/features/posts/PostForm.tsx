import { ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";
import type { Post, Visibility } from "@/types";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  initial?: Post;
  prefilledStart?: number;
  prefilledEnd?: number;
  onClose?: () => void;
  onSaved?: () => void;
}

interface DateParts {
  date: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  period: "am" | "pm";
}

const toParts = (timestamp: number, format: "12" | "24" = "24"): DateParts => {
  const date = new Date(timestamp);
  const hour24 = date.getHours();
  const hour = format === "12" ? ((hour24 + 11) % 12) + 1 : hour24;
  return {
    date: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
    hour: String(hour).padStart(2, "0"),
    minute: String(date.getMinutes()).padStart(2, "0"),
    period: hour24 >= 12 ? "pm" : "am",
  };
};

const fromParts = (parts: DateParts, format: "12" | "24" = "24") => {
  let hour = Number(parts.hour);
  if (format === "12") {
    hour = hour % 12;
    if (parts.period === "pm") hour += 12;
  }
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.date),
    hour,
    Number(parts.minute),
    0,
    0
  ).getTime();
};

export const PostForm = ({ initial, prefilledStart, prefilledEnd, onClose, onSaved }: Props) => {
  const { currentUser, users, settings, addPost, updatePost, getAcceptedConnectionIds } = useApp();
  const timeFormat = settings.timeFormat ?? "24";
  const [startParts, setStartParts] = useState(() => toParts(initial?.startTime ?? prefilledStart ?? Date.now() - 30 * 60_000, timeFormat));
  const [endParts, setEndParts] = useState(() => toParts(initial?.endTime ?? prefilledEnd ?? Date.now(), timeFormat));
  const [content, setContent] = useState(initial?.content ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? currentUser?.privacy ?? "public");
  const [customUsernames, setCustomUsernames] = useState<string[]>(initial?.customUsernames ?? currentUser?.customUsernames ?? []);
  const [usernameQuery, setUsernameQuery] = useState("");

  const connectedIds = currentUser ? getAcceptedConnectionIds(currentUser.id) : [];
  const connections = users.filter((u) => connectedIds.includes(u.id));
  const nowParts = useMemo(() => toParts(Date.now(), timeFormat), [timeFormat]);

  const updatePart = (side: "start" | "end", key: keyof DateParts, value: string) => {
    const clean = key === "period" ? value : value.replace(/\D/g, "").slice(0, key === "year" ? 4 : 2);
    const setter = side === "start" ? setStartParts : setEndParts;
    setter((parts) => ({ ...parts, [key]: clean }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      startTime: fromParts(startParts, timeFormat),
      endTime: fromParts(endParts, timeFormat),
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
          <Button type="button" size="sm" variant="outline" className="h-8 bg-card text-xs" onClick={() => setEndParts(toParts(Date.now(), timeFormat))}>
            Use current time
          </Button>
        </div>
        <div className="space-y-4">
          <TimeGrid label="Start" parts={startParts} onChange={(key, value) => updatePart("start", key, value)} maxParts={nowParts} timeFormat={timeFormat} />
          <TimeGrid label="End" parts={endParts} onChange={(key, value) => updatePart("end", key, value)} maxParts={nowParts} timeFormat={timeFormat} />
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
          <UsernameChecklist
            users={connections}
            selectedUsernames={customUsernames}
            query={usernameQuery}
            onQueryChange={setUsernameQuery}
            onToggle={(username, checked) =>
              setCustomUsernames((items) =>
                checked ? [...new Set([...items, username])] : items.filter((item) => item !== username)
              )
            }
            emptyText="Connect with people first, then choose who can read this post."
          />
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
  timeFormat,
  onChange,
}: {
  label: string;
  parts: DateParts;
  maxParts: DateParts;
  timeFormat: "12" | "24";
  onChange: (key: keyof DateParts, value: string) => void;
}) => (
  <section>
    <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
      <Clock3 className="size-3.5 text-accent" />
      {label}
    </p>
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1.45fr] gap-2">
        <PartInput label="Date" value={parts.date} onChange={(value) => onChange("date", value)} min={1} max={31} />
        <PartInput label="Month" value={parts.month} onChange={(value) => onChange("month", value)} min={1} max={12} />
        <PartInput label="Year" value={parts.year} onChange={(value) => onChange("year", value)} min={1970} max={9999} />
      </div>
      <div className={timeFormat === "12" ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
        <PartInput label="Hour" value={parts.hour} onChange={(value) => onChange("hour", value)} min={timeFormat === "12" ? 1 : 0} max={timeFormat === "12" ? 12 : 23} />
        <PartInput label="Minute" value={parts.minute} onChange={(value) => onChange("minute", value)} min={0} max={59} />
        {timeFormat === "12" && <PeriodDropdown value={parts.period} onChange={(value) => onChange("period", value)} />}
      </div>
    </div>
  </section>
);

const PeriodDropdown = ({ value, onChange }: { value: "am" | "pm"; onChange: (value: "am" | "pm") => void }) => {
  const [open, setOpen] = useState(false);
  const choose = (next: "am" | "pm") => {
    onChange(next);
    setOpen(false);
  };

  return (
    <label className="relative">
      <span className="mb-1 block text-center text-[10px] font-black uppercase text-muted-foreground">AM/PM</span>
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-12 w-full items-center justify-center rounded-lg border border-input bg-background px-2 pr-7 text-sm font-black uppercase tabular-nums ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:text-base"
      >
        {value}
        <ChevronDown className="absolute right-2 top-2 size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {(["am", "pm"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className={`block h-9 w-full rounded-md text-center text-sm font-black uppercase ${option === value ? "bg-primary-soft text-primary" : ""}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </label>
  );
};

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
      className="h-12 rounded-lg bg-background px-2 text-center text-sm font-black tabular-nums sm:text-base"
    />
  </label>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-2">
    <label className="text-xs font-bold uppercase text-muted-foreground">{label}</label>
    {children}
  </div>
);

const UsernameChecklist = ({
  users,
  selectedUsernames,
  query,
  onQueryChange,
  onToggle,
  emptyText,
}: {
  users: { id: string; username: string }[];
  selectedUsernames: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (username: string, checked: boolean) => void;
  emptyText: string;
}) => {
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (users.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-3">
      <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search usernames" className="bg-background" />
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No matching usernames.</p>
        ) : (
          filtered.map((user) => (
            <label key={user.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <Checkbox checked={selectedUsernames.includes(user.username)} onCheckedChange={(checked) => onToggle(user.username, checked === true)} />
              <span className="font-bold">{user.username}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

export default PostForm;
