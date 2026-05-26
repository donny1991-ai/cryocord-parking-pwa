"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VisitRow } from "./visit-row";
import { data } from "@/lib/data";
import { MOCK_NOW } from "@/lib/mock";
import { STATUSES } from "@/lib/enums";
import { statusLabel } from "@/lib/labels";
import { cn, normalisePlate } from "@/lib/utils";
import { downloadVisitLogExcel } from "@/lib/visit-export";

type Filter = "all" | (typeof STATUSES)[number];

export function VisitsList() {
  const all = data.allVisits();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = normalisePlate(query);
    return all.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (!q) return true;
      return normalisePlate(v.plate).includes(q) || v.visitorName.toUpperCase().includes(query.toUpperCase());
    });
  }, [all, query, filter]);

  const filters: Filter[] = ["all", ...STATUSES];

  function exportExcel() {
    const date = new Date().toISOString().slice(0, 10);
    downloadVisitLogExcel(filtered, `cryocord-visitor-log-${date}.xls`);
  }

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

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold text-ink-faint">{filtered.length} visits</p>
        <Button variant="outline" size="sm" className="bg-white/65" disabled={filtered.length === 0} onClick={exportExcel}>
          <Download className="h-4 w-4" />
          Excel
        </Button>
      </div>

      <div className="space-y-2.5">
        {filtered.map((v) => (
          <VisitRow key={v.id} visit={v} now={MOCK_NOW} />
        ))}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-faint">No visits match.</p>
        )}
      </div>
    </div>
  );
}
