"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, CheckCircle2, Pencil, Phone, Search, Send, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { PlateCapture } from "./plate-capture";
import { QrPass } from "./qr-pass";
import { VISIT_TYPES, PURPOSES, type VisitType, type Purpose } from "@/lib/enums";
import { labelize } from "@/lib/labels";
import { cn, formatDateTime, normalisePlate } from "@/lib/utils";
import { buildPassMessage, waLink } from "@/lib/whatsapp";
import type { Employee, Vehicle } from "@/lib/types";

type Step = "capture" | "form" | "pass";

export function NewEntryFlow({ employees, vehicles }: { employees: Employee[]; vehicles: Vehicle[] }) {
  const [step, setStep] = useState<Step>("capture");
  const [plate, setPlate] = useState("");
  const [editingPlate, setEditingPlate] = useState(false);
  const [plateDraft, setPlateDraft] = useState("");

  const known = useMemo(() => {
    const normalised = normalisePlate(plate);
    return normalised ? vehicles.find((vehicle) => vehicle.plateNormalised === normalised) : undefined;
  }, [plate, vehicles]);

  const [visitorName, setVisitorName] = useState("");
  const [visitorContact, setVisitorContact] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [visitType, setVisitType] = useState<VisitType>("visitor");
  const [purpose, setPurpose] = useState<Purpose>("meeting");
  const [visitTime, setVisitTime] = useState("");
  const [visitorCount, setVisitorCount] = useState("");
  const [purposeNotes, setPurposeNotes] = useState("");
  const [identityType, setIdentityType] = useState<"nric" | "passport">("nric");
  const [nric, setNric] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [hostStaffId, setHostStaffId] = useState("");
  const [hostQuery, setHostQuery] = useState("");
  const [hostSearchOpen, setHostSearchOpen] = useState(false);
  const selectedHost = useMemo(
    () => employees.find((employee) => employee.staffId === hostStaffId),
    [employees, hostStaffId],
  );
  const hostResults = useMemo(() => {
    const query = hostQuery.trim().toLowerCase();
    const source = query
      ? employees.filter((employee) =>
        [
          employee.name,
          employee.email,
          employee.staffId,
          employee.department,
          employee.phone,
          employee.extension,
        ].some((value) => String(value ?? "").toLowerCase().includes(query)),
      )
      : employees;

    return source.slice(0, 6);
  }, [employees, hostQuery]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [issued, setIssued] = useState<{ id: string; token: string; tokenExpiresAt: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const remarksRequired = visitType === "other" || purpose === "other";
  const hasIdentityDocument = identityType === "nric" ? nric.trim() : passportNumber.trim();

  function prefillKnownVehicle(p: string) {
    const normalised = normalisePlate(p);
    const veh = vehicles.find((vehicle) => vehicle.plateNormalised === normalised);
    if (veh) {
      if (veh.ownerName && veh.ownerName !== "Unknown") setVisitorName(veh.ownerName);
      if (veh.ownerContact) setVisitorContact(veh.ownerContact);
      if (veh.ownerType && (VISIT_TYPES as readonly string[]).includes(veh.ownerType)) {
        setVisitType(veh.ownerType as VisitType);
      }
    }
  }

  function selectPlate(p: string) {
    const nextPlate = normalisePlate(p);
    setPlate(nextPlate);
    setPlateDraft(nextPlate);
    setEditingPlate(false);
    prefillKnownVehicle(nextPlate);
    setStep("form");
  }

  function startPlateEdit() {
    setPlateDraft(plate);
    setEditingPlate(true);
  }

  function savePlateEdit() {
    const nextPlate = normalisePlate(plateDraft);
    if (nextPlate.length < 3) return;

    setPlate(nextPlate);
    setPlateDraft(nextPlate);
    setEditingPlate(false);
    prefillKnownVehicle(nextPlate);
  }

  const canIssue =
    plate &&
    visitorName.trim() &&
    visitorContact.trim() &&
    hasIdentityDocument &&
    (!remarksRequired || purposeNotes.trim());

  function selectHost(host: Employee) {
    setHostStaffId(host.staffId);
    setHostQuery(host.name);
    setHostSearchOpen(false);
  }

  async function issuePass() {
    if (!canIssue) return;

    setIssuing(true);
    setIssueError(null);

    try {
      const response = await fetch("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: visitorName,
          phoneNumber: visitorContact,
          organisation: organisation || undefined,
          identityType: hasIdentityDocument ? identityType : undefined,
          nric: identityType === "nric" && hasIdentityDocument ? nric : undefined,
          passportNumber: identityType === "passport" && hasIdentityDocument ? passportNumber : undefined,
          vehicleNumber: plate,
          typeCode: visitType,
          purpose,
          visitTime: visitTime || undefined,
          visitorCount: visitorCount || undefined,
          remarks: purposeNotes || undefined,
          hostStaffId: hostStaffId || undefined,
          hostDepartment: selectedHost?.department,
          flagReason: known?.blacklisted ? "Plate matched the vehicle blacklist on entry." : undefined,
          checkInOnCreate: true,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Visitor pass could not be saved.");
      }

      const payload = await response.json();
      setIssued({ id: payload.visitor.id, token: payload.token, tokenExpiresAt: payload.tokenExpiresAt });
      setStep("pass");
    } catch (error) {
      setIssueError(
        error instanceof Error ? error.message : "Visitor pass could not be saved.",
      );
    } finally {
      setIssuing(false);
    }
  }

  if (step === "capture") {
    return (
      <div className="space-y-4">
        <StepDots step={1} />
        <PlateCapture onPlate={selectPlate} />
      </div>
    );
  }

  if (step === "pass" && issued) {
    const passUrl = origin ? `${origin}/pass/${encodeURIComponent(issued.token)}` : undefined;
    const validUntil = formatDateTime(issued.tokenExpiresAt);
    const waHref = waLink(
      visitorContact,
      buildPassMessage({ visitorName, plate, visitType, validUntil, passUrl }),
    );
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-1 text-center animate-fade-up">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Entry logged</h2>
          <p className="text-sm text-ink-faint">Vehicle is checked in. Use this QR pass for check-out.</p>
        </div>
        <QrPass
          token={issued.token}
          plate={plate}
          visitorName={visitorName}
          visitType={visitType}
          validUntil={validUntil}
        />
        <div className="mx-auto flex max-w-sm flex-col gap-2.5">
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              <Send className="h-4 w-4" /> Send to visitor via WhatsApp
            </a>
          ) : (
            <div className="text-center">
              <Button variant="outline" className="w-full" disabled>
                <Send className="h-4 w-4" /> Send via WhatsApp
              </Button>
              <p className="mt-1 text-xs text-ink-faint">Add a valid contact number to enable.</p>
            </div>
          )}
          <Link href="/parking">
            <Button variant="glass" className="w-full">Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  // step === "form"
  return (
    <div className="space-y-4">
      <StepDots step={2} />

      {/* Plate header */}
      <GlassCard padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Plate</p>
            {editingPlate ? (
              <Input
                value={plateDraft}
                onChange={(event) => setPlateDraft(event.target.value.toUpperCase())}
                placeholder="e.g. WA 18 K"
                inputMode="text"
                autoCapitalize="characters"
                className="mt-1 h-11 text-xl font-bold tracking-wide"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") savePlateEdit();
                  if (event.key === "Escape") setEditingPlate(false);
                }}
              />
            ) : (
              <p className="truncate text-2xl font-bold tracking-wide text-ink">{plate}</p>
            )}
          </div>

          {editingPlate ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancel plate edit"
                onClick={() => {
                  setPlateDraft(plate);
                  setEditingPlate(false);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="subtle"
                size="icon"
                aria-label="Save plate"
                disabled={normalisePlate(plateDraft).length < 3}
                onClick={savePlateEdit}
              >
                <Check className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={startPlateEdit} className="text-xs font-semibold text-brand">
                <Pencil className="mr-1 inline h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPlate(false);
                  setStep("capture");
                }}
                className="text-xs font-semibold text-brand"
              >
                Re-scan
              </button>
            </div>
          )}
        </div>

        {editingPlate && (
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Correct the OCR result before logging the entry. Spaces and dashes are removed when saved.
          </p>
        )}
      </GlassCard>

      {known && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>
            {known.blacklisted ? (
              <span className="font-bold text-brand">Blacklisted vehicle — escalate to duty manager.</span>
            ) : (
              <>Known vehicle — details pre-filled from registry.</>
            )}
          </span>
        </div>
      )}

      <GlassCard padding="lg" className="space-y-4">
        <Field label="Visitor name" required>
          <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Contact number" required>
          <Input
            value={visitorContact}
            onChange={(e) => setVisitorContact(e.target.value)}
            placeholder="+60…"
            inputMode="tel"
          />
        </Field>

        <Field label="Company / organisation">
          <Input
            value={organisation}
            onChange={(e) => setOrganisation(e.target.value)}
            placeholder="Company or organisation"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Visit type" required>
            <Select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)}>
              {VISIT_TYPES.map((t) => (
                <option key={t} value={t}>{labelize(t)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose" required>
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>{labelize(p)}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Visit time">
            <Input value={visitTime} onChange={(e) => setVisitTime(e.target.value)} type="time" />
          </Field>
          <Field label="Number of visitors">
            <Input
              value={visitorCount}
              onChange={(e) => setVisitorCount(e.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              placeholder="e.g. 3"
            />
          </Field>
        </div>

        <Field
          label="Remarks"
          required={remarksRequired}
          hint={remarksRequired ? "Required when visit type or purpose is Other." : "Optional notes for the visit."}
        >
          <Textarea
            value={purposeNotes}
            onChange={(e) => setPurposeNotes(e.target.value)}
            placeholder="Add notes for the guard, if needed"
            required={remarksRequired}
          />
        </Field>

        <div className="space-y-1.5">
          <span className="block text-sm font-semibold text-ink-soft">Host</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={hostQuery}
              onChange={(event) => {
                setHostQuery(event.target.value);
                setHostStaffId("");
                setHostSearchOpen(true);
              }}
              onFocus={() => setHostSearchOpen(true)}
              placeholder="Search host name, email, department"
              className="pl-11"
              role="combobox"
              aria-label="Host"
              aria-expanded={hostSearchOpen}
              aria-controls="host-search-results"
              aria-autocomplete="list"
            />
            {hostQuery && (
              <button
                type="button"
                aria-label="Clear host"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-white/70 hover:text-brand"
                onClick={() => {
                  setHostQuery("");
                  setHostStaffId("");
                  setHostSearchOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="block text-xs text-ink-faint">Search the HR employee directory before confirming the visitor.</span>

          {hostSearchOpen && (
            <div
              id="host-search-results"
              className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-lift backdrop-blur-md"
            >
              {hostResults.length > 0 ? (
                hostResults.map((host) => (
                  <button
                    key={host.staffId}
                    type="button"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-brand/5 focus:bg-brand/5 focus:outline-none"
                    onClick={() => selectHost(host)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-ink-faint/10 text-ink-soft">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{host.name}</span>
                      <span className="block truncate text-xs font-semibold text-ink-soft">{host.department}</span>
                      <span className="block truncate text-xs text-ink-faint">{host.email ?? "No email in HR directory"}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-ink-faint/10 px-2.5 py-1 text-xs font-semibold text-ink-soft sm:inline-flex">
                      {host.staffId}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3.5 py-3 text-sm text-ink-faint">No matching host found.</p>
              )}
            </div>
          )}

        </div>

        {selectedHost && (
          <div className="rounded-2xl border border-white/60 bg-white/45 px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Host contact</p>
            <p className="mt-1 text-sm font-bold text-ink">{selectedHost.name}</p>
            <p className="text-xs text-ink-faint">{selectedHost.department}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
              {selectedHost.phone ? (
                <a href={`tel:${selectedHost.phone}`} className="inline-flex items-center gap-1 text-brand">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedHost.phone}
                </a>
              ) : (
                <span>No phone number in HR directory</span>
              )}
              {selectedHost.extension && <span>Ext {selectedHost.extension}</span>}
            </div>
          </div>
        )}

        <Field label="Identity document" required hint="Choose NRIC for Malaysians, passport for non-Malaysians.">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/40 p-1">
            <button
              type="button"
              className={cn(
                "h-10 rounded-xl text-sm font-bold transition",
                identityType === "nric" ? "bg-white text-brand shadow-sm" : "text-ink-soft",
              )}
              onClick={() => setIdentityType("nric")}
            >
              NRIC
            </button>
            <button
              type="button"
              className={cn(
                "h-10 rounded-xl text-sm font-bold transition",
                identityType === "passport" ? "bg-white text-brand shadow-sm" : "text-ink-soft",
              )}
              onClick={() => setIdentityType("passport")}
            >
              Passport
            </button>
          </div>
        </Field>

        {identityType === "nric" ? (
          <Field label="NRIC number" required hint="Format: YYMMDD-PB-####.">
            <Input value={nric} onChange={(e) => setNric(e.target.value)} placeholder="900101-14-1234" />
          </Field>
        ) : (
          <Field label="Passport number" required>
            <Input
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value.toUpperCase())}
              placeholder="Passport number"
            />
          </Field>
        )}
      </GlassCard>

      {/* Consent notice */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-white/45 px-3.5 py-3 backdrop-blur-md">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Data collected for premises security and access control. Retained 90 days; stored in
          Malaysia (Azure MY West). Refer to the CryoCord Privacy Policy.
        </p>
      </div>

      {issueError && (
        <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {issueError}
        </p>
      )}

      <Button size="xl" className="w-full" disabled={!canIssue || issuing} onClick={issuePass}>
        <Sparkles className="h-5 w-5" />
        {issuing ? "Logging..." : "Log Entry & Issue Pass"}
      </Button>
    </div>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Capture", "Details", "Pass"];
  const pct = (step / labels.length) * 100;
  return (
    <div className="mx-auto max-w-xs">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-faint/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold">
        {labels.map((l, i) => (
          <span key={l} className={cn(i + 1 <= step ? "text-brand" : "text-ink-faint")}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
