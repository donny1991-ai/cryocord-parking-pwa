import { cn } from "@/lib/utils";
import { STATUS_STYLE, statusLabel } from "@/lib/labels";
import type { Status } from "@/lib/enums";

/** Translucent status pill with a status dot. */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold backdrop-blur-sm",
        s.pill,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {statusLabel(status)}
    </span>
  );
}

/** Neutral glass chip for visit type / purpose etc. */
export function Chip({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border backdrop-blur-sm",
        tone === "brand"
          ? "bg-brand/10 text-brand border-brand/20"
          : "bg-white/55 text-ink-soft border-white/60",
        className,
      )}
    >
      {children}
    </span>
  );
}
