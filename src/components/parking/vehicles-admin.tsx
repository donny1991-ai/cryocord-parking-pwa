"use client";

import { useMemo, useState } from "react";
import { Ban, Plus, Search, ShieldOff, Upload, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { data } from "@/lib/data";
import { OWNER_TYPES, type OwnerType } from "@/lib/enums";
import { labelize, ownerTypeLabel } from "@/lib/labels";
import { normalisePlate } from "@/lib/utils";
import type { Vehicle } from "@/lib/types";

export function VehiclesAdmin() {
  const [list, setList] = useState<Vehicle[]>(() => data.vehicles());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = normalisePlate(query);
    if (!q) return list;
    return list.filter(
      (v) => v.plateNormalised.includes(q) || (v.ownerName ?? "").toUpperCase().includes(query.toUpperCase()),
    );
  }, [list, query]);

  function toggleBlacklist(id: string) {
    setList((prev) => prev.map((v) => (v.id === id ? { ...v, blacklisted: !v.blacklisted } : v)));
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plate or owner" className="pl-10" />
        </div>
        <Button variant={adding ? "glass" : "primary"} size="lg" onClick={() => setAdding((a) => !a)}>
          {adding ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>

      {adding && <AddVehicleForm onAdd={(v) => { setList((p) => [v, ...p]); setAdding(false); }} />}

      <button className="flex items-center gap-1.5 px-1 text-xs font-semibold text-brand">
        <Upload className="h-3.5 w-3.5" /> Bulk import staff vehicles (CSV)
      </button>

      <div className="space-y-2.5">
        {filtered.map((v) => (
          <GlassCard key={v.id} padding="md" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink">{v.plate}</span>
                {v.ownerType && <Chip tone="brand">{ownerTypeLabel(v.ownerType)}</Chip>}
                {v.blacklisted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand">
                    <Ban className="h-3 w-3" /> Blacklisted
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-faint">
                {v.ownerName ?? "—"}
                {v.staffId ? ` · ${v.staffId}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant={v.blacklisted ? "subtle" : "outline"}
              onClick={() => toggleBlacklist(v.id)}
            >
              {v.blacklisted ? (
                <><ShieldOff className="h-4 w-4" /> Unblock</>
              ) : (
                <><Ban className="h-4 w-4" /> Block</>
              )}
            </Button>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function AddVehicleForm({ onAdd }: { onAdd: (v: Vehicle) => void }) {
  const [plate, setPlate] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType>("staff");

  function submit() {
    const now = new Date().toISOString();
    onAdd({
      id: `veh-${normalisePlate(plate)}`,
      plate,
      plateNormalised: normalisePlate(plate),
      ownerName,
      ownerType,
      blacklisted: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return (
    <GlassCard variant="strong" padding="lg" className="space-y-3">
      <Field label="Plate" required>
        <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="WA 18 K" className="font-bold tracking-wide" />
      </Field>
      <Field label="Owner name">
        <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Full name" />
      </Field>
      <Field label="Owner type">
        <Select value={ownerType} onChange={(e) => setOwnerType(e.target.value as OwnerType)}>
          {OWNER_TYPES.map((t) => (
            <option key={t} value={t}>{labelize(t)}</option>
          ))}
        </Select>
      </Field>
      <Button className="w-full" disabled={normalisePlate(plate).length < 3} onClick={submit}>
        <Plus className="h-5 w-5" /> Add to registry
      </Button>
    </GlassCard>
  );
}
