"use client";

import { FormEvent, useState } from "react";
import { Check, CheckCircle2, Clock3, Pencil, Plus, Save, ShieldCheck, TimerReset, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Input, Select } from "@/components/ui/input";
import type { ParkingAdminSettings } from "@/lib/server/admin-settings";
import type { AdminOptionKind, CodeOption, CompanyOption, ParkingAdminOptions, VisitTypePurposeRuleOption } from "@/lib/server/admin-options";

type OptionListName = "companies" | "visitorTypes" | "purposes";
type EditableOption = CompanyOption | CodeOption;

export function SettingsAdmin({
  settings,
  options,
}: {
  settings: ParkingAdminSettings;
  options: ParkingAdminOptions;
}) {
  const [authSessionExpiresHours, setAuthSessionExpiresHours] = useState(String(settings.authSessionExpiresHours));
  const [overstayAllowedDays, setOverstayAllowedDays] = useState(String(settings.overstayAllowedDays));
  const [saved, setSaved] = useState(settings);
  const [optionLists, setOptionLists] = useState(options);
  const [busy, setBusy] = useState(false);
  const [optionBusy, setOptionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authSessionExpiresHours: Number(authSessionExpiresHours),
          overstayAllowedDays: Number(overstayAllowedDays),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }
      setSaved(payload.settings);
      setNotice("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOption(kind: AdminOptionKind, listName: OptionListName, input: { id?: string | number; name?: string; label?: string; code?: string }) {
    const busyKey = `${kind}:${input.id ?? "new"}`;
    setOptionBusy(busyKey);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/options", {
        method: input.id === undefined ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...input }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Option could not be saved.");

      setOptionLists((current) => {
        const existing = current[listName] as EditableOption[];
        const next = input.id === undefined
          ? [...existing, payload.option]
          : existing.map((option) => (String(option.id) === String(input.id) ? payload.option : option));
        return { ...current, [listName]: next };
      });
      setNotice("Option saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Option could not be saved.");
    } finally {
      setOptionBusy(null);
    }
  }

  async function deleteOption(kind: AdminOptionKind, listName: OptionListName, option: EditableOption) {
    const busyKey = `${kind}:${option.id}`;
    setOptionBusy(busyKey);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/options", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: option.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Option could not be removed.");

      setOptionLists((current) => ({
        ...current,
        [listName]: (current[listName] as EditableOption[]).filter((item) => String(item.id) !== String(option.id)),
      }));
      setNotice("Option removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Option could not be removed.");
    } finally {
      setOptionBusy(null);
    }
  }

  async function savePurposeRule(input: { id?: string; visitorTypeCode: string; purposeCode: string }) {
    const busyKey = `purposeRule:${input.id ?? "new"}`;
    setOptionBusy(busyKey);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/options", {
        method: input.id === undefined ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "purposeRule", ...input }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Rule could not be saved.");

      setOptionLists((current) => ({
        ...current,
        visitTypePurposeRules: input.id === undefined
          ? [...current.visitTypePurposeRules, payload.rule]
          : current.visitTypePurposeRules.map((rule) => (rule.id === input.id ? payload.rule : rule)),
      }));
      setNotice("Rule saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Rule could not be saved.");
    } finally {
      setOptionBusy(null);
    }
  }

  async function deletePurposeRule(rule: VisitTypePurposeRuleOption) {
    const busyKey = `purposeRule:${rule.id}`;
    setOptionBusy(busyKey);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/options", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "purposeRule", id: rule.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Rule could not be removed.");

      setOptionLists((current) => ({
        ...current,
        visitTypePurposeRules: current.visitTypePurposeRules.filter((item) => item.id !== rule.id),
      }));
      setNotice("Rule removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Rule could not be removed.");
    } finally {
      setOptionBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <GlassCard padding="sm" className="rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            <Clock3 className="h-3.5 w-3.5" />
            Token
          </div>
          <p className="mt-1 text-2xl font-black text-ink">{saved.authSessionExpiresHours}h</p>
        </GlassCard>
        <GlassCard padding="sm" className="rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            <TimerReset className="h-3.5 w-3.5" />
            Overstay
          </div>
          <p className="mt-1 text-2xl font-black text-ink">
            {saved.overstayAllowedDays === 0 ? "Same day" : `${saved.overstayAllowedDays}d`}
          </p>
        </GlassCard>
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

      <GlassCard variant="strong" padding="lg">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Token auth expiry" hint="Hours before the next OTP login is required." required>
            <Input
              type="number"
              min={1}
              max={168}
              step={1}
              value={authSessionExpiresHours}
              onChange={(event) => setAuthSessionExpiresHours(event.target.value)}
            />
          </Field>
          <Field label="Overstay allowance" hint="0 means overstayed after the check-in day ends." required>
            <Input
              type="number"
              min={0}
              max={30}
              step={1}
              value={overstayAllowedDays}
              onChange={(event) => setOverstayAllowedDays(event.target.value)}
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            <Save className="h-5 w-5" />
            {busy ? "Saving..." : "Save settings"}
          </Button>
        </form>
      </GlassCard>

      <OptionManager
        title="Companies"
        addLabel="Company name"
        kind="company"
        listName="companies"
        options={optionLists.companies}
        busyKey={optionBusy}
        onSave={saveOption}
        onDelete={deleteOption}
      />

      <OptionManager
        title="Visitor types"
        addLabel="Visitor type"
        kind="visitorType"
        listName="visitorTypes"
        options={optionLists.visitorTypes}
        busyKey={optionBusy}
        onSave={saveOption}
        onDelete={deleteOption}
      />

      <OptionManager
        title="Purposes"
        addLabel="Purpose"
        kind="purpose"
        listName="purposes"
        options={optionLists.purposes}
        busyKey={optionBusy}
        onSave={saveOption}
        onDelete={deleteOption}
      />

      <PurposeRuleManager
        visitorTypes={optionLists.visitorTypes}
        purposes={optionLists.purposes}
        rules={optionLists.visitTypePurposeRules}
        busyKey={optionBusy}
        onSave={savePurposeRule}
        onDelete={deletePurposeRule}
      />

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Changes apply to new login tokens and refreshed parking snapshots.
        </p>
      </GlassCard>
    </div>
  );
}

function optionLabel(options: CodeOption[], code: string) {
  return options.find((option) => option.code === code)?.label ?? code;
}

function PurposeRuleManager({
  visitorTypes,
  purposes,
  rules,
  busyKey,
  onSave,
  onDelete,
}: {
  visitorTypes: CodeOption[];
  purposes: CodeOption[];
  rules: VisitTypePurposeRuleOption[];
  busyKey: string | null;
  onSave: (input: { id?: string; visitorTypeCode: string; purposeCode: string }) => Promise<void>;
  onDelete: (rule: VisitTypePurposeRuleOption) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newVisitorTypeCode, setNewVisitorTypeCode] = useState(visitorTypes[0]?.code ?? "");
  const [newPurposeCode, setNewPurposeCode] = useState(purposes[0]?.code ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVisitorTypeCode, setEditingVisitorTypeCode] = useState("");
  const [editingPurposeCode, setEditingPurposeCode] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const usedVisitorTypeCodes = new Set(rules.map((rule) => rule.visitorTypeCode));
  const availableVisitorTypes = visitorTypes.filter((type) => !usedVisitorTypeCodes.has(type.code));

  async function addRule() {
    if (!newVisitorTypeCode || !newPurposeCode) return;
    await onSave({ visitorTypeCode: newVisitorTypeCode, purposeCode: newPurposeCode });
    const nextAvailable = availableVisitorTypes.find((type) => type.code !== newVisitorTypeCode);
    setNewVisitorTypeCode(nextAvailable?.code ?? "");
    setNewPurposeCode(purposes[0]?.code ?? "");
    setAdding(false);
  }

  async function saveEdit(rule: VisitTypePurposeRuleOption) {
    if (!editingVisitorTypeCode || !editingPurposeCode) return;
    await onSave({
      id: rule.id,
      visitorTypeCode: editingVisitorTypeCode,
      purposeCode: editingPurposeCode,
    });
    setEditingId(null);
  }

  return (
    <GlassCard variant="strong" padding="lg" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">Visit type defaults</h2>
        <Button
          type="button"
          variant={adding ? "glass" : "outline"}
          size="sm"
          disabled={!adding && availableVisitorTypes.length === 0}
          onClick={() => {
            if (!adding && !newVisitorTypeCode) setNewVisitorTypeCode(availableVisitorTypes[0]?.code ?? "");
            if (!adding && !newPurposeCode) setNewPurposeCode(purposes[0]?.code ?? "");
            setAdding((value) => !value);
          }}
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? "Cancel" : "Add"}
        </Button>
      </div>

      {adding && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={newVisitorTypeCode} onChange={(event) => setNewVisitorTypeCode(event.target.value)}>
            {availableVisitorTypes.map((type) => (
              <option key={type.code} value={type.code}>{type.label}</option>
            ))}
          </Select>
          <Select value={newPurposeCode} onChange={(event) => setNewPurposeCode(event.target.value)}>
            {purposes.map((purpose) => (
              <option key={purpose.code} value={purpose.code}>{purpose.label}</option>
            ))}
          </Select>
          <Button
            type="button"
            size="icon"
            disabled={busyKey !== null || !newVisitorTypeCode || !newPurposeCode}
            onClick={addRule}
            aria-label="Add visit type default"
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => {
          const busy = busyKey === `purposeRule:${rule.id}`;
          const editing = editingId === rule.id;
          const confirming = confirmingId === rule.id;

          return (
            <div key={rule.id} className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2.5">
              {editing ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <Select value={editingVisitorTypeCode} onChange={(event) => setEditingVisitorTypeCode(event.target.value)}>
                    {visitorTypes.map((type) => (
                      <option key={type.code} value={type.code}>{type.label}</option>
                    ))}
                  </Select>
                  <Select value={editingPurposeCode} onChange={(event) => setEditingPurposeCode(event.target.value)}>
                    {purposes.map((purpose) => (
                      <option key={purpose.code} value={purpose.code}>{purpose.label}</option>
                    ))}
                  </Select>
                  <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setEditingId(null)} aria-label="Cancel rule edit">
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="subtle"
                    size="icon"
                    disabled={busy || !editingVisitorTypeCode || !editingPurposeCode}
                    onClick={() => saveEdit(rule)}
                    aria-label="Save visit type default"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {optionLabel(visitorTypes, rule.visitorTypeCode)} {"->"} {optionLabel(purposes, rule.purposeCode)}
                    </p>
                    <p className="truncate text-xs font-semibold text-ink-faint">
                      {rule.visitorTypeCode} {"->"} {rule.purposeCode}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busyKey !== null}
                    onClick={() => {
                      setEditingId(rule.id);
                      setEditingVisitorTypeCode(rule.visitorTypeCode);
                      setEditingPurposeCode(rule.purposeCode);
                      setConfirmingId(null);
                    }}
                    aria-label={`Edit default for ${optionLabel(visitorTypes, rule.visitorTypeCode)}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-brand"
                    disabled={busyKey !== null}
                    onClick={() => setConfirmingId(confirming ? null : rule.id)}
                    aria-label={`Remove default for ${optionLabel(visitorTypes, rule.visitorTypeCode)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {confirming && !editing && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">
                  <span>Remove this default?</span>
                  <Button type="button" variant="subtle" size="sm" disabled={busy} onClick={() => onDelete(rule)}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function optionText(option: EditableOption) {
  return "name" in option ? option.name : option.label;
}

function optionCode(option: EditableOption) {
  return "code" in option ? option.code : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function OptionManager({
  title,
  addLabel,
  kind,
  listName,
  options,
  busyKey,
  onSave,
  onDelete,
}: {
  title: string;
  addLabel: string;
  kind: AdminOptionKind;
  listName: OptionListName;
  options: EditableOption[];
  busyKey: string | null;
  onSave: (kind: AdminOptionKind, listName: OptionListName, input: { id?: string | number; name?: string; label?: string; code?: string }) => Promise<void>;
  onDelete: (kind: AdminOptionKind, listName: OptionListName, option: EditableOption) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const isCodeOption = kind !== "company";

  async function addOption() {
    if (!newText.trim()) return;
    await onSave(kind, listName, {
      name: kind === "company" ? newText : undefined,
      label: kind === "company" ? undefined : newText,
      code: kind === "company" ? undefined : slugify(newText),
    });
    setNewText("");
    setAdding(false);
  }

  async function saveEdit(option: EditableOption) {
    if (!editingText.trim()) return;
    await onSave(kind, listName, {
      id: option.id,
      name: kind === "company" ? editingText : undefined,
      label: kind === "company" ? undefined : editingText,
    });
    setEditingId(null);
    setEditingText("");
  }

  return (
    <GlassCard variant="strong" padding="lg" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <Button type="button" variant={adding ? "glass" : "outline"} size="sm" onClick={() => setAdding((value) => !value)}>
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? "Cancel" : "Add"}
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <Input
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
            placeholder={addLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addOption();
            }}
          />
          <Button type="button" size="icon" disabled={busyKey !== null || !newText.trim()} onClick={addOption} aria-label={`Add ${addLabel}`}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {options.map((option) => {
          const id = String(option.id);
          const code = optionCode(option);
          const busy = busyKey === `${kind}:${id}`;
          const editing = editingId === id;
          const confirming = confirmingId === id;

          return (
            <div key={id} className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Input
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveEdit(option);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className="truncate text-sm font-bold text-ink">{optionText(option)}</p>
                      {isCodeOption && code && <p className="truncate text-xs font-semibold text-ink-faint">{code}</p>}
                    </>
                  )}
                </div>

                {editing ? (
                  <>
                    <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setEditingId(null)} aria-label="Cancel edit">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="subtle" size="icon" disabled={busy || !editingText.trim()} onClick={() => saveEdit(option)} aria-label="Save option">
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busyKey !== null}
                      onClick={() => {
                        setEditingId(id);
                        setEditingText(optionText(option));
                        setConfirmingId(null);
                      }}
                      aria-label={`Edit ${optionText(option)}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-brand"
                      disabled={busyKey !== null}
                      onClick={() => setConfirmingId(confirming ? null : id)}
                      aria-label={`Remove ${optionText(option)}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {confirming && !editing && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">
                  <span>Remove this option?</span>
                  <Button type="button" variant="subtle" size="sm" disabled={busy} onClick={() => onDelete(kind, listName, option)}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
