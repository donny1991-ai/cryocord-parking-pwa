"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Search, UserRound, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import type { Employee } from "@/lib/types";
import { cn } from "@/lib/utils";
import { waCallLink } from "@/lib/whatsapp";

function matchesHost(employee: Employee, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [employee.name, employee.staffId, employee.department, employee.email]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export function VisitorHostEditControl({
  visitId,
  employees,
  currentHost,
  currentHostStaffId,
  currentHostDepartment,
  canEdit = false,
}: {
  visitId: string;
  employees: Employee[];
  currentHost?: Employee;
  currentHostStaffId?: string;
  currentHostDepartment?: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const initialQuery = currentHost?.name ?? currentHostStaffId ?? "";
  const [hostQuery, setHostQuery] = useState(initialQuery);
  const [hostStaffId, setHostStaffId] = useState(currentHost?.staffId ?? currentHostStaffId ?? "");
  const [selectedHost, setSelectedHost] = useState<Employee | undefined>(currentHost);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState(!currentHost && !currentHostStaffId && canEdit);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostResults = useMemo(
    () => employees.filter((employee) => matchesHost(employee, hostQuery)).slice(0, 6),
    [employees, hostQuery],
  );
  const unchanged = Boolean(hostStaffId && hostStaffId === (currentHost?.staffId ?? currentHostStaffId ?? ""));
  const currentHostName = currentHost?.name ?? currentHostStaffId ?? "Host not found";
  const currentHostDepartmentLabel = currentHost?.department ?? currentHostDepartment ?? "Department unavailable";
  const phone = currentHost?.phone;
  const whatsappCallHref = phone ? waCallLink(phone) : null;

  async function saveHost() {
    if (!hostStaffId || busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(`/api/visitors/${visitId}/host`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostStaffId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update host.");
      }
      setNotice(payload.visitor?.changed === false ? "Host is already up to date." : "Host updated and recorded in audit trail.");
      setEditing(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update host.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-ink-faint">Host</p>
          <p className="mt-1 text-lg font-bold leading-tight text-ink">{currentHostName}</p>
          <p className="text-sm text-ink-faint">{currentHostDepartmentLabel}</p>
          {canEdit && (
            <p className="mt-1 text-xs text-ink-faint">
              Guards can reassign the confirmed HR host until the end of the visit date.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {whatsappCallHref ? (
            <a
              href={whatsappCallHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1 sm:flex-none")}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Call
            </a>
          ) : null}
          {canEdit && (
            <Button
              type="button"
              variant={editing ? "glass" : "outline"}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setEditing((value) => !value);
                setSearchOpen(false);
                setNotice(null);
                setError(null);
              }}
            >
              {editing ? "Cancel" : "Change host"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2">
          <p className="text-xs text-ink-faint">Phone</p>
          <p className="font-semibold text-ink">{phone ?? "No phone number in HR directory"}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2">
          <p className="text-xs text-ink-faint">Extension</p>
          <p className="font-semibold text-ink">{currentHost?.extension ?? "—"}</p>
        </div>
      </div>

      {editing && (
        <div className="space-y-3 border-t border-white/60 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={hostQuery}
              onChange={(event) => {
                setHostQuery(event.target.value);
                setHostStaffId("");
                setSelectedHost(undefined);
                setSearchOpen(true);
                setNotice(null);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search host name or department"
              className="pl-11"
              role="combobox"
              aria-label="Change host"
              aria-expanded={searchOpen}
            />
            {hostQuery && (
              <button
                type="button"
                aria-label="Clear host"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-white/70 hover:text-brand"
                onClick={() => {
                  setHostQuery("");
                  setHostStaffId("");
                  setSelectedHost(undefined);
                  setSearchOpen(false);
                  setNotice(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {searchOpen && (
            <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-lift backdrop-blur-md">
              {hostResults.length > 0 ? (
                hostResults.map((host) => (
                  <button
                    key={host.staffId}
                    type="button"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-brand/5 focus:bg-brand/5 focus:outline-none"
                    onClick={() => {
                      setSelectedHost(host);
                      setHostStaffId(host.staffId);
                      setHostQuery(host.name);
                      setSearchOpen(false);
                      setNotice(null);
                    }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ink-faint/10 text-ink-soft">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{host.name}</span>
                      <span className="block truncate text-xs font-semibold text-ink-soft">{host.department}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3.5 py-3 text-sm text-ink-faint">No matching host found.</p>
              )}
            </div>
          )}

          {selectedHost && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Selected host</p>
              <p className="mt-1 text-sm font-bold text-ink">{selectedHost.name}</p>
              <p className="text-xs text-ink-faint">{selectedHost.department}</p>
            </div>
          )}

          <Button type="button" className="w-full" onClick={saveHost} disabled={!hostStaffId || busy || unchanged}>
            <Check className="h-4 w-4" />
            {busy ? "Saving..." : "Save host change"}
          </Button>
        </div>
      )}

      {!canEdit && (
        <p className="rounded-2xl bg-white/40 px-3 py-2 text-xs font-semibold text-ink-faint">
          Host changes are closed after the visit date.
        </p>
      )}

      {notice && <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}
      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">{error}</p>}
    </GlassCard>
  );
}
