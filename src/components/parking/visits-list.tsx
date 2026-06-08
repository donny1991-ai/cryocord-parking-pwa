"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { VisitRow } from "./visit-row";
import { STATUSES } from "@/lib/enums";
import { statusLabel } from "@/lib/labels";
import { cn, normalisePlate } from "@/lib/utils";
import type { Visit } from "@/lib/types";

type Filter = "all" | (typeof STATUSES)[number];

export function VisitsList({ visits, nowIso }: { visits: Visit[]; nowIso: string }) {
  const all = visits;
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = normalisePlate(query);
    return all.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (!q) return true;
      const additionalMatch = (v.additionalPlates ?? []).some((plate) => normalisePlate(plate).includes(q));
      const vehicleMatch = (v.vehicles ?? []).some((vehicle) => normalisePlate(vehicle.plate).includes(q));
      return (
        additionalMatch ||
        vehicleMatch ||
        normalisePlate(v.plate).includes(q) ||
        v.visitorName.toUpperCase().includes(query.toUpperCase())
      );
    });
  }, [all, query, filter]);

  const filters: Filter[] = ["all", ...STATUSES];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plate or visitor"
          className="pl-10"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold backdrop-blur-sm transition-colors",
              filter === f
                ? "border-brand bg-brand text-white"
                : "border-white/60 bg-white/55 text-ink-soft hover:text-brand",
            )}
          >
            {f === "all" ? "All" : statusLabel(f)}
          </button>
        ))}
      </div>

      <p className="px-1 text-xs font-semibold text-ink-faint">{filtered.length} records</p>

      <div className="space-y-2.5">
        {filtered.map((v) => (
          <VisitRow key={`${v.id}:${v.vehicleId ?? "registration"}`} visit={v} now={now} />
        ))}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-faint">No visits match.</p>
        )}
      </div>
    </div>
  );
}
