"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Ban, CarFront, Check, CheckCircle2, Keyboard, MessageCircle, Pencil, Plus, Search, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field, Textarea } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { QrPass } from "./qr-pass";
import { QrPassShareButton } from "./qr-pass-share-button";
import { VISIT_TYPES, PURPOSES, type VisitType, type Purpose } from "@/lib/enums";
import { labelize } from "@/lib/labels";
import { cn, formatDateTime, normalisePlate } from "@/lib/utils";
import { buildPassMessage, waCallLink, waLink } from "@/lib/whatsapp";
import type { Employee, Vehicle } from "@/lib/types";

type Step = "capture" | "form" | "pass";

function normaliseNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseNameRows(value: string[]) {
  return value
    .map(normaliseNameInput)
    .filter(Boolean);
}

function parsePastedNames(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normaliseAdditionalVehicleInput(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

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
  const [otherVisitorNameRows, setOtherVisitorNameRows] = useState<string[]>([]);
  const [additionalVehiclePlates, setAdditionalVehiclePlates] = useState<string[]>([]);
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
  const selectedHostWhatsappCallHref = selectedHost?.phone ? waCallLink(selectedHost.phone) : null;
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
  const blockedVehicle = known?.blacklisted ? known : null;
  const visitorCountNumber = useMemo(() => {
    if (!visitorCount.trim()) return null;
    const count = Number(visitorCount);
    return Number.isInteger(count) && count > 0 ? count : null;
  }, [visitorCount]);
  const showOtherVisitorNames = Boolean(visitorCountNumber && visitorCountNumber > 1);
  const otherVisitorNames = useMemo(() => parseNameRows(otherVisitorNameRows), [otherVisitorNameRows]);
  const additionalVehicleNumbers = useMemo(
    () => additionalVehiclePlates.map(normaliseAdditionalVehicleInput).filter(Boolean),
    [additionalVehiclePlates],
  );
  const additionalVehicleRowsValid = additionalVehiclePlates.every((item) => normalisePlate(item).length >= 3);

  function syncOtherVisitorRowsForCount(value: string) {
    const count = Number(value);
    if (!Number.isInteger(count) || count <= 1) {
      setOtherVisitorNameRows([]);
      return;
    }

    const targetRows = count - 1;
    setOtherVisitorNameRows((rows) => {
      if (rows.length === targetRows) return rows;
      if (rows.length > targetRows) return rows.slice(0, targetRows);
      return [...rows, ...Array.from({ length: targetRows - rows.length }, () => "")];
    });
  }

  function updateVisitorCount(value: string) {
    setVisitorCount(value);
    syncOtherVisitorRowsForCount(value);
  }

  function addOtherVisitorRow() {
    const next = [...otherVisitorNameRows, ""];
    setOtherVisitorNameRows(next);
    setVisitorCount(String(next.length + 1));
  }

  function removeOtherVisitorRow(index: number) {
    const next = otherVisitorNameRows.filter((_, itemIndex) => itemIndex !== index);
    setOtherVisitorNameRows(next);
    setVisitorCount(next.length > 0 ? String(next.length + 1) : "1");
  }

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

  const canIssue = Boolean(
    plate &&
    visitorName.trim() &&
    visitorContact.trim() &&
    selectedHost &&
    hasIdentityDocument &&
    !blockedVehicle &&
    additionalVehicleRowsValid &&
    (!remarksRequired || purposeNotes.trim()),
  );

  function selectHost(host: Employee) {
    setHostStaffId(host.staffId);
    setHostQuery(host.name);
    setHostSearchOpen(false);
  }

  async function issuePass() {
    if (!canIssue) return;
    if (blockedVehicle) {
      setIssueError("This vehicle is blacklisted. Registration is blocked. Contact the duty manager.");
      return;
    }

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
          additionalVehicleNumbers: additionalVehicleNumbers.length > 0 ? additionalVehicleNumbers : undefined,
          typeCode: visitType,
          purpose,
          visitTime: visitTime || undefined,
          visitorCount: visitorCount || undefined,
          otherVisitorNames: showOtherVisitorNames && otherVisitorNames.length > 0 ? otherVisitorNames : undefined,
          remarks: purposeNotes || undefined,
          hostStaffId: hostStaffId || undefined,
          hostDepartment: selectedHost?.department,
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
        <ManualPlateEntry onPlate={selectPlate} />
      </div>
    );
  }

  if (step === "pass" && issued) {
    const passUrl = origin ? `${origin}/pass/${encodeURIComponent(issued.token)}` : undefined;
    const validUntil = formatDateTime(issued.tokenExpiresAt);
    const passHeading = "Keep for exit scan";
    const passMessage = buildPassMessage({
      visitorName,
      plate,
      additionalPlates: additionalVehicleNumbers,
      visitType,
      validUntil,
      passUrl,
    });
    const waHref = waLink(visitorContact, passMessage);
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
          additionalPlates={additionalVehicleNumbers}
          visitorName={visitorName}
          visitType={visitType}
          validUntil={validUntil}
          heading={passHeading}
        />
        <div className="mx-auto flex max-w-sm flex-col gap-2.5">
          <QrPassShareButton
            token={issued.token}
            plate={plate}
            additionalPlates={additionalVehicleNumbers}
            visitorName={visitorName}
            visitType={visitType}
            validUntil={validUntil}
            heading={passHeading}
            message={passMessage}
            whatsappHref={waHref}
          />
          {!waHref && <p className="text-center text-xs text-ink-faint">Add a valid contact number to open WhatsApp text.</p>}
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
                Change plate
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

      {blockedVehicle ? (
        <div className="rounded-2xl border border-brand/25 bg-brand/10 px-3.5 py-3 text-sm text-brand">
          <div className="flex items-center gap-2 font-bold">
            <Ban className="h-4 w-4 shrink-0" />
            Vehicle is blacklisted. Registration is blocked.
          </div>
          <p className="mt-1 text-xs font-semibold text-brand/85">
            Do not issue a visitor pass for {blockedVehicle.plate}. Contact the duty manager for clearance.
          </p>
          {blockedVehicle.notes && (
            <p className="mt-2 rounded-2xl bg-white/60 px-3 py-2 text-xs font-semibold text-ink-soft">
              Reason: {blockedVehicle.notes}
            </p>
          )}
        </div>
      ) : known ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>Known allowed vehicle — not blacklisted; details pre-filled from registry.</span>
        </div>
      ) : null}

      <GlassCard padding="lg" className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink-soft">Additional vehicle plates</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-dashed bg-white/30"
              onClick={() => setAdditionalVehiclePlates((items) => [...items, ""])}
            >
              <Plus className="h-4 w-4" /> Add vehicle
            </Button>
          </div>

          {additionalVehiclePlates.length > 0 && (
            <div className="space-y-2">
              {additionalVehiclePlates.map((additionalPlate, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={additionalPlate}
                    onChange={(event) => {
                      const next = [...additionalVehiclePlates];
                      next[index] = event.target.value.toUpperCase();
                      setAdditionalVehiclePlates(next);
                    }}
                    placeholder={`Additional plate ${index + 1}`}
                    inputMode="text"
                    autoCapitalize="characters"
                    className="font-bold tracking-wide"
                    aria-label={`Additional vehicle ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-xl bg-white/55 text-ink-soft"
                    aria-label={`Remove additional vehicle ${index + 1}`}
                    onClick={() => setAdditionalVehiclePlates((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Main visitor name" required>
          <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Main visitor contact number" required>
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
              onChange={(e) => updateVisitorCount(e.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              placeholder="e.g. 3"
            />
          </Field>
        </div>

        {showOtherVisitorNames && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink-soft">Additional visitors</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-dashed bg-white/30"
                onClick={addOtherVisitorRow}
              >
                <Plus className="h-4 w-4" /> Add visitor
              </Button>
            </div>

            <div className="space-y-2">
              {otherVisitorNameRows.map((otherVisitorName, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={otherVisitorName}
                    onChange={(event) => {
                      const pastedNames = parsePastedNames(event.target.value);
                      if (pastedNames.length > 1) {
                        const next = [...otherVisitorNameRows];
                        next.splice(index, 1, ...pastedNames);
                        setOtherVisitorNameRows(next);
                        setVisitorCount(String(next.length + 1));
                        return;
                      }

                      const next = [...otherVisitorNameRows];
                      next[index] = event.target.value;
                      setOtherVisitorNameRows(next);
                    }}
                    placeholder={`Additional visitor ${index + 1} full name`}
                    aria-label={`Other visitor ${index + 1} name`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 rounded-xl bg-white/55 text-ink-soft"
                    aria-label={`Remove other visitor ${index + 1}`}
                    onClick={() => removeOtherVisitorRow(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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
          <span className="block text-sm font-semibold text-ink-soft">
            Host <span className="text-brand">*</span>
          </span>
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
                selectedHostWhatsappCallHref ? (
                  <a
                    href={selectedHostWhatsappCallHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp Call {selectedHost.phone}
                  </a>
                ) : (
                  <span>{selectedHost.phone}</span>
                )
              ) : (
                <span>No phone number in HR directory</span>
              )}
              {selectedHost.extension && <span>Ext {selectedHost.extension}</span>}
            </div>
          </div>
        )}

        <Field
          label="Main visitor identity document"
          required
          hint="Only the main visitor needs NRIC/passport details. Additional visitors are recorded by name."
        >
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
          <Field label="Main visitor NRIC number" required hint="Main visitor only. Format: YYMMDD-PB-####.">
            <Input value={nric} onChange={(e) => setNric(e.target.value)} placeholder="900101-14-1234" />
          </Field>
        ) : (
          <Field label="Main visitor passport number" required hint="Main visitor only.">
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

      {blockedVehicle && (
        <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-bold text-brand">
          Entry logging is disabled because this plate is blacklisted.
        </p>
      )}

      <Button size="xl" className="w-full" disabled={!canIssue || issuing} onClick={issuePass}>
        <Sparkles className="h-5 w-5" />
        {issuing ? "Logging..." : "Log Entry & Issue Pass"}
      </Button>
    </div>
  );
}

function ManualPlateEntry({ onPlate }: { onPlate: (plate: string) => void }) {
  const [manual, setManual] = useState("");
  const normalised = normalisePlate(manual);
  const canUse = normalised.length >= 3;

  function submit() {
    if (!canUse) return;
    onPlate(normalised);
  }

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15">
          <CarFront className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-ink">Manual vehicle entry</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-faint">
            Type the visitor plate, then complete the guard registration details.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={manual}
          onChange={(event) => setManual(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="e.g. WA 18 K"
          inputMode="text"
          autoCapitalize="characters"
          className="h-14 text-lg font-bold tracking-wide"
          aria-label="Vehicle plate"
          autoFocus
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 shrink-0 bg-white/55"
          disabled={!canUse}
          onClick={submit}
        >
          <Keyboard className="h-5 w-5" />
          Use
        </Button>
      </div>

      <p className="rounded-2xl bg-white/45 px-3 py-2 text-xs font-medium leading-relaxed text-ink-faint">
        Use this when the visitor cannot open the public registration form or show a QR pass.
      </p>
    </GlassCard>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Plate", "Details", "Pass"];
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
