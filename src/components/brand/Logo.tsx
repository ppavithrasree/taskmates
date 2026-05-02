import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  to?: string;
  compact?: boolean;
  className?: string;
}

export const Logo = ({ to = "/", compact = false, className }: LogoProps) => (
  <Link to={to} className={cn("flex items-center gap-2 group", className)}>
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-glow transition-smooth group-hover:scale-105">
      <CheckCircle2 className="size-5 text-primary-foreground" strokeWidth={2.5} />
    </div>
    {!compact && <span className="text-xl font-bold tracking-tight">TaskMates</span>}
  </Link>
);

export default Logo;
