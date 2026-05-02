import { Globe, Lock, Users } from "lucide-react";
import type { Visibility } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  value: Visibility;
  onChange: (value: Visibility) => void;
  className?: string;
}

const options: { value: Visibility; label: string; icon: typeof Globe; hint: string }[] = [
  { value: "public", label: "Public", icon: Globe, hint: "Friends feed" },
  { value: "private", label: "Private", icon: Lock, hint: "Only you" },
  { value: "custom", label: "Custom", icon: Users, hint: "Pick friends" },
];

export const PrivacySelector = ({ value, onChange, className }: Props) => (
  <div className={cn("grid grid-cols-3 gap-2", className)}>
    {options.map((option) => {
      const Icon = option.icon;
      const active = value === option.value;

      return (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex min-h-24 flex-col items-start justify-between gap-2 rounded-lg border p-3 text-left transition-smooth",
            active
              ? "border-primary bg-primary-soft text-primary shadow-soft"
              : "border-border bg-card text-foreground hover:border-primary/40"
          )}
          aria-pressed={active}
        >
          <Icon className="size-4" />
          <span>
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className={cn("block text-[11px]", active ? "text-primary/80" : "text-muted-foreground")}>
              {option.hint}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

export default PrivacySelector;
