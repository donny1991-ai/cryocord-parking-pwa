import Link from "next/link";
import { CalendarPlus, ChevronRight, Clock } from "lucide-react";
import type { Visit } from "@/lib/types";
import { StatusPill, Chip } from "@/components/ui/badge";
import { visitTypeLabel, purposeLabel, STATUS_STYLE } from "@/lib/labels";
import { cn, durationSince, formatTime } from "@/lib/utils";

/** Compact visit row used on the dashboard and visit log. */
export function VisitRow({ visit, now, showQuickRegister = false }: { visit: Visit; now?: Date; showQuickRegister?: boolean }) {
  const live = visit.status === "inside" || visit.status === "overstayed" || visit.status === "flagged";
  const canQuickRegister = showQuickRegister && visit.status === "exited";
  const s = STATUS_STYLE[visit.status];

  return (
    <div className="glass relative flex items-center gap-2 overflow-hidden rounded-2xl p-3.5 pl-4">
      {/* Status accent bar */}
      <span className={cn("absolute inset-y-2 left-0 w-1 rounded-full", s.dot)} />

      <Link
        href={`/parking/visit/${visit.id}`}
        className="glass-interactive -m-3.5 -ml-4 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3.5 pl-4"
      >
        {/* Plate avatar with status dot */}
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/12 to-brand/5 ring-1 ring-brand/10">
          <span className="text-sm font-bold tracking-tight text-brand">{visit.plate.split(" ")[0]}</span>
          <span className={cn("absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white", s.dot)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-ink">{visit.plate}</span>
            <StatusPill status={visit.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            <Chip tone="brand">{visitTypeLabel(visit.visitType)}</Chip>
            <span>{purposeLabel(visit.purpose)}</span>
            <span className="truncate">· {visit.visitorName}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-ink-soft">
            <Clock className="h-3 w-3" />
            {live ? durationSince(visit.entryTime, now) : formatTime(visit.entryTime)}
          </span>
          {!canQuickRegister && <ChevronRight className="h-4 w-4 text-ink-faint" />}
        </div>
      </Link>

      {canQuickRegister && (
        <Link
          href={`/parking/pre-register?fromVisit=${encodeURIComponent(visit.id)}`}
          aria-label={`Quick re-register ${visit.plate}`}
          title="Quick re-register"
          className="glass-interactive flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand"
        >
          <CalendarPlus className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
