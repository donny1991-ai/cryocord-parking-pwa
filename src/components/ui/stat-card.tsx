import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "./glass-card";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  trend,
  hero = false,
  tone = "default",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: { dir: "up" | "down"; label: string };
  hero?: boolean;
  tone?: "default" | "muted";
  className?: string;
}) {
  const muted = tone === "muted";

  return (
    <GlassCard
      variant={hero ? "red" : "default"}
      padding="md"
      className={cn(muted && "border-stone-200/70 bg-stone-100/65 shadow-none", className)}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              hero ? "text-white/80" : muted ? "text-stone-500" : "text-ink-faint",
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              hero ? "bg-white/20" : muted ? "bg-stone-200/80" : "bg-brand/10",
            )}
          >
            <Icon className={cn("h-5 w-5", hero ? "text-white" : muted ? "text-stone-500" : "text-brand")} />
          </span>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span
            className={cn(
              "text-3xl font-bold tabular-nums leading-none",
              hero ? "text-white" : muted ? "text-stone-700" : "text-ink",
            )}
          >
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "mb-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                trend.dir === "up"
                  ? "bg-emerald-500/12 text-emerald-600"
                  : "bg-brand/10 text-brand",
              )}
            >
              {trend.dir === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend.label}
            </span>
          )}
        </div>

        {sublabel && (
          <div className={cn("mt-1 text-xs", hero ? "text-white/75" : muted ? "text-stone-500" : "text-ink-faint")}>
            {sublabel}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
