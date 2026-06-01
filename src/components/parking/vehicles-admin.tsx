"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Plus, Search, ShieldOff, Upload, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { OWNER_TYPES, type OwnerType } from "@/lib/enums";
import { labelize, ownerTypeLabel } from "@/lib/labels";
import { normalisePlate } from "@/lib/utils";
import type { Vehicle } from "@/lib/types";

export function VehiclesAdmin({ vehicles }: { vehicles: Vehicle[] }) {
  const [list, setList] = useState<Vehicle[]>(() => vehicles);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalisePlate(query);
    if (!q) return list;
    return list.filter(
      (v) => v.plateNormalised.includes(q) || (v.ownerName ?? "").toUpperCase().includes(query.toUpperCase()),
    );
  }, [list, query]);

  async function toggleBlacklist(vehicle: Vehicle) {
    setBusyId(vehicle.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blacklisted: !vehicle.blacklisted }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Vehicle could not be updated.");
      }

      setList((prev) => prev.map((v) => (v.id === vehicle.id ? payload.vehicle : v)));
      setNotice(payload.vehicle.blacklisted ? "Vehicle blocked." : "Vehicle unblocked.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Vehicle could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function addVehicle(input: { plate: string; ownerName: string; ownerType: OwnerType }) {
    setBusyId("new");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: input.plate,
          ownerName: input.ownerName,
          ownerType: input.ownerType,
          blacklisted: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Vehicle could not be created.");
      }
      setList((prev) => [payload.vehicle, ...prev]);
      setNotice("Vehicle added.");
      setAdding(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Vehicle could not be created.");
    } finally {
      setBusyId(null);
    }
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

      {error && (
        <GlassCard variant="bare" padding="sm" className="border-brand/25 bg-brand/10 text-sm font-semibold text-brand">
          {error}
        </GlassCard>
      )}
      {notice && !error && (
        <GlassCard variant="bare" padding="sm" className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </GlassCard>
      )}

      {adding && <AddVehicleForm busy={busyId === "new"} onAdd={addVehicle} />}

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
              disabled={busyId !== null}
              onClick={() => toggleBlacklist(v)}
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

function AddVehicleForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (input: { plate: string; ownerName: string; ownerType: OwnerType }) => void;
}) {
  const [plate, setPlate] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType>("staff");

  function submit() {
    onAdd({
      plate,
      ownerName,
      ownerType,
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
      <Button className="w-full" disabled={normalisePlate(plate).length < 3 || busy} onClick={submit}>
        <Plus className="h-5 w-5" /> {busy ? "Adding..." : "Add to registry"}
      </Button>
    </GlassCard>
  );
}
