"use client";

import { useState } from "react";
import { CarFront, QrCode } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { Vehicle, Employee } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrivalScanFlow } from "./arrival-scan-flow";
import { NewEntryFlow } from "./new-entry-flow";

type EntryMode = "plate" | "qr";

export function EntryWorkflow({
  employees,
  vehicles,
  initialMode = "plate",
}: {
  employees: Employee[];
  vehicles: Vehicle[];
  initialMode?: EntryMode;
}) {
  const [mode, setMode] = useState<EntryMode>(initialMode);

  return (
    <div className="space-y-4">
      <GlassCard padding="sm" className="grid grid-cols-2 gap-2">
        <ModeButton
          active={mode === "plate"}
          icon={CarFront}
          title="Plate entry"
          subtitle="Manual entry and pass"
          onClick={() => setMode("plate")}
        />
        <ModeButton
          active={mode === "qr"}
          icon={QrCode}
          title="QR arrival"
          subtitle="Scan visitor pass"
          onClick={() => setMode("qr")}
        />
      </GlassCard>

      {mode === "plate" ? (
        <NewEntryFlow employees={employees} vehicles={vehicles} />
      ) : (
        <ArrivalScanFlow employees={employees} />
      )}
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: typeof CarFront;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[4.75rem] items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
        active
          ? "bg-brand text-white shadow-[0_14px_30px_-20px_rgba(200,16,46,0.75)]"
          : "bg-white/45 text-ink hover:bg-white/70",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
          active ? "bg-white/18 text-white ring-white/25" : "bg-brand/10 text-brand ring-brand/15",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className={cn("mt-0.5 block text-xs", active ? "text-white/80" : "text-ink-faint")}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
