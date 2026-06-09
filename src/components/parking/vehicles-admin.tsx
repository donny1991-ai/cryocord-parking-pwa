"use client";

import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Pencil, Plus, Search, ShieldOff, Trash2, Upload, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { OWNER_TYPES, type OwnerType } from "@/lib/enums";
import { labelize, ownerTypeLabel } from "@/lib/labels";
import { normalisePlate } from "@/lib/utils";
import type { Vehicle } from "@/lib/types";

type VehicleFormState = {
  plate: string;
  ownerName: string;
  ownerContact: string;
  ownerEmail: string;
  ownerType: OwnerType | "";
  staffId: string;
  notes: string;
  blacklisted: boolean;
};

export function VehiclesAdmin({ vehicles }: { vehicles: Vehicle[] }) {
  const [list, setList] = useState<Vehicle[]>(() => vehicles);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VehicleFormState | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
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
      setNotice(payload.vehicle.blacklisted ? "Vehicle blacklisted. New entries will be blocked." : "Vehicle unblocked. New entries are allowed.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Vehicle could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setEditForm(toVehicleForm(vehicle));
    setConfirmingDeleteId(null);
    setError(null);
    setNotice(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveVehicle(vehicleId: string) {
    if (!editForm) return;

    setBusyId(vehicleId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehicleFormPayload(editForm)),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Vehicle could not be updated.");
      }

      setList((prev) => prev.map((vehicle) => (vehicle.id === vehicleId ? payload.vehicle : vehicle)));
      setNotice("Vehicle details updated.");
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Vehicle could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeVehicle(vehicle: Vehicle) {
    setBusyId(vehicle.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/vehicles/${vehicle.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Vehicle could not be removed.");
      }

      setList((prev) => prev.filter((item) => item.id !== vehicle.id));
      setNotice(`${vehicle.plate} removed from known vehicles. Visitor history is unchanged.`);
      if (editingId === vehicle.id) cancelEdit();
      setConfirmingDeleteId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Vehicle could not be removed.");
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
          <GlassCard key={v.id} padding="md" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{v.plate}</span>
                  {v.ownerType && <Chip>{ownerTypeLabel(v.ownerType)}</Chip>}
                  {v.blacklisted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand">
                      <Ban className="h-3 w-3" /> Blacklisted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Allowed
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {v.ownerName ?? "—"}
                  {v.staffId ? ` · ${v.staffId}` : ""}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-ink-faint">
                  {v.blacklisted ? "Entry registration is blocked for this plate." : "Not blacklisted; entry registration is allowed."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="glass"
                  disabled={busyId !== null}
                  onClick={() => startEdit(v)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={v.blacklisted ? "subtle" : "outline"}
                  disabled={busyId !== null}
                  onClick={() => toggleBlacklist(v)}
                >
                  {v.blacklisted ? (
                    <><ShieldOff className="h-4 w-4" /> Unblock vehicle</>
                  ) : (
                    <><Ban className="h-4 w-4" /> Block vehicle</>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-brand"
                  disabled={busyId !== null}
                  onClick={() => {
                    setConfirmingDeleteId(v.id);
                    setEditingId(null);
                    setEditForm(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </div>
            </div>

            {editingId === v.id && editForm && (
              <VehicleEditForm
                form={editForm}
                busy={busyId === v.id}
                onChange={setEditForm}
                onCancel={cancelEdit}
                onSave={() => saveVehicle(v.id)}
              />
            )}

            {confirmingDeleteId === v.id && (
              <div className="rounded-2xl border border-brand/20 bg-brand/10 px-3.5 py-3">
                <p className="text-sm font-bold text-brand">Remove this vehicle from known vehicles?</p>
                <p className="mt-1 text-xs font-semibold text-ink-soft">
                  Visitor history and past registrations will remain unchanged. Removal is blocked if this plate is currently checked in.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="glass"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => setConfirmingDeleteId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => removeVehicle(v)}
                  >
                    <Trash2 className="h-4 w-4" /> {busyId === v.id ? "Removing..." : "Remove vehicle"}
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function toVehicleForm(vehicle: Vehicle): VehicleFormState {
  return {
    plate: vehicle.plate,
    ownerName: vehicle.ownerName ?? "",
    ownerContact: vehicle.ownerContact ?? "",
    ownerEmail: vehicle.ownerEmail ?? "",
    ownerType: vehicle.ownerType ?? "",
    staffId: vehicle.staffId ?? "",
    notes: vehicle.notes ?? "",
    blacklisted: vehicle.blacklisted,
  };
}

function vehicleFormPayload(form: VehicleFormState) {
  return {
    plate: form.plate,
    ownerName: form.ownerName,
    ownerContact: form.ownerContact,
    ownerEmail: form.ownerEmail,
    ownerType: form.ownerType || null,
    staffId: form.staffId,
    notes: form.notes,
    blacklisted: form.blacklisted,
  };
}

function VehicleEditForm({
  form,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  form: VehicleFormState;
  busy: boolean;
  onChange: (form: VehicleFormState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const canSave = normalisePlate(form.plate).length >= 3;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/45 p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Plate" required>
          <Input
            value={form.plate}
            onChange={(event) => onChange({ ...form, plate: event.target.value.toUpperCase() })}
            placeholder="WA 18 K"
            className="font-bold tracking-wide"
          />
        </Field>
        <Field label="Owner type">
          <Select
            value={form.ownerType}
            onChange={(event) => onChange({ ...form, ownerType: event.target.value as OwnerType | "" })}
          >
            <option value="">Not set</option>
            {OWNER_TYPES.map((type) => (
              <option key={type} value={type}>{labelize(type)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Owner name">
          <Input
            value={form.ownerName}
            onChange={(event) => onChange({ ...form, ownerName: event.target.value })}
            placeholder="Full name"
          />
        </Field>
        <Field label="Owner contact">
          <Input
            value={form.ownerContact}
            onChange={(event) => onChange({ ...form, ownerContact: event.target.value })}
            placeholder="+60..."
            inputMode="tel"
          />
        </Field>
        <Field label="Owner email">
          <Input
            value={form.ownerEmail}
            onChange={(event) => onChange({ ...form, ownerEmail: event.target.value })}
            placeholder="name@example.com"
            inputMode="email"
          />
        </Field>
        <Field label="Staff ID">
          <Input
            value={form.staffId}
            onChange={(event) => onChange({ ...form, staffId: event.target.value.toUpperCase() })}
            placeholder="EMP-0001"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field
          label={form.blacklisted ? "Security / blacklist reason" : "Notes"}
          hint={form.blacklisted ? "Shown to guards when entry is blocked." : "Optional registry notes."}
        >
          <Textarea
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            placeholder={form.blacklisted ? "Reason this vehicle is blocked" : "Optional notes"}
          />
        </Field>
      </div>

      <label className="mt-3 flex items-start gap-2 rounded-2xl bg-white/55 px-3 py-2 text-sm font-bold text-ink-soft">
        <input
          type="checkbox"
          checked={form.blacklisted}
          onChange={(event) => onChange({ ...form, blacklisted: event.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-brand/40 accent-brand"
        />
        Blacklist this vehicle and block new entry registrations
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="glass" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!canSave || busy} onClick={onSave}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
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
