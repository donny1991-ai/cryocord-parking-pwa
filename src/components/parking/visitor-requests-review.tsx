"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Phone, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { purposeLabel } from "@/lib/labels";
import type { Employee, VisitorRequest } from "@/lib/types";

function maskDocument(request: VisitorRequest) {
  if (request.identityType === "passport") {
    const value = request.passportNumber ?? "";
    return `Passport ****${value.slice(-4)}`;
  }
  const value = request.nric ?? "";
  return `NRIC ******-**-${value.slice(-4)}`;
}

function matchesHost(employee: Employee, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [employee.name, employee.staffId, employee.department, employee.email]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export function VisitorRequestsReview({
  requests,
  employees,
}: {
  requests: VisitorRequest[];
  employees: Employee[];
}) {
  const submitted = requests.filter((request) => request.status === "submitted");
  const reviewed = requests.filter((request) => request.status !== "submitted");

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-label">Waiting for security</h2>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{submitted.length}</span>
        </div>
        <div className="space-y-3">
          {submitted.map((request) => (
            <VisitorRequestCard key={request.id} request={request} employees={employees} />
          ))}
          {submitted.length === 0 && (
            <GlassCard padding="lg" className="text-center text-sm font-semibold text-ink-faint">
              No public registrations are waiting.
            </GlassCard>
          )}
        </div>
      </section>

      {reviewed.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Reviewed</h2>
          <div className="space-y-2.5">
            {reviewed.slice(0, 10).map((request) => (
              <GlassCard key={request.id} variant="bare" padding="sm" className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{request.vehicleNumber}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {request.name} · {request.status === "converted" ? "Converted" : "Rejected"}
                  </p>
                </div>
                {request.convertedVisitorId && (
                  <Link
                    href={`/parking/visit/${request.convertedVisitorId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                  >
                    Open <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </GlassCard>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function VisitorRequestCard({ request, employees }: { request: VisitorRequest; employees: Employee[] }) {
  const router = useRouter();
  const [hostQuery, setHostQuery] = useState("");
  const [hostStaffId, setHostStaffId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedHost = employees.find((employee) => employee.staffId === hostStaffId);
  const hostResults = useMemo(() => employees.filter((employee) => matchesHost(employee, hostQuery)).slice(0, 6), [employees, hostQuery]);

  async function review(action: "approve" | "reject") {
    if (action === "approve" && !selectedHost) return;
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(`/api/visitor-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject"
            ? { action: "reject" }
            : { action: "approve", hostStaffId: selectedHost?.staffId, checkInOnCreate: true },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to review request.");
      }
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to review request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-ink">{request.vehicleNumber}</p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">{request.name}</p>
        </div>
        <span className="rounded-full border border-sky-500/25 bg-sky-500/12 px-3 py-1 text-xs font-bold text-sky-700">
          Submitted
        </span>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Contact" value={request.phoneNumber} />
        <Info label="Identity" value={maskDocument(request)} />
        <Info label="Purpose" value={purposeLabel(request.purpose)} />
        <Info label="Requested host" value={request.requestedHostText} />
        <Info label="Organisation" value={request.organisation ?? "Not provided"} />
        <Info label="Visitors" value={String(request.visitorCount ?? 1)} />
      </div>

      {request.otherVisitorNames.length > 0 && (
        <div className="rounded-2xl bg-white/45 px-3.5 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Additional visitors</p>
          <p className="mt-1 text-sm font-semibold text-ink">{request.otherVisitorNames.join(", ")}</p>
        </div>
      )}

      {request.remarks && (
        <div className="rounded-2xl bg-white/45 px-3.5 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Notes</p>
          <p className="mt-1 text-sm font-semibold text-ink">{request.remarks}</p>
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-sm font-semibold text-ink-soft">
          Assign confirmed host <span className="text-brand">*</span>
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={hostQuery}
            onChange={(event) => {
              setHostQuery(event.target.value);
              setHostStaffId("");
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search host name or department"
            className="pl-11"
            role="combobox"
            aria-label={`Assign host for ${request.vehicleNumber}`}
            aria-expanded={searchOpen}
            aria-required="true"
          />
          {hostQuery && (
            <button
              type="button"
              aria-label="Clear host"
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-white/70 hover:text-brand"
              onClick={() => {
                setHostQuery("");
                setHostStaffId("");
                setSearchOpen(false);
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
                    setHostStaffId(host.staffId);
                    setHostQuery(host.name);
                    setSearchOpen(false);
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
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Confirmed host</p>
            <div className="mt-2 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-emerald-700">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{selectedHost.name}</p>
                <p className="truncate text-xs font-semibold text-ink-soft">{selectedHost.department}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedHost.phone || "No phone number in HR directory"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Button type="button" disabled={!selectedHost || busy !== null} onClick={() => review("approve")}>
          <Check className="h-4 w-4" />
          {busy === "approve" ? "Approving..." : "Approve & check in"}
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => review("reject")}>
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
    </GlassCard>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/35 px-3.5 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 break-words font-semibold text-ink">{value}</p>
    </div>
  );
}
