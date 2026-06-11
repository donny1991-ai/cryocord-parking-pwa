"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Ban, CameraOff, CheckCircle2, LogIn, MessageCircle, Plus, ScanLine, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { checkCameraSupport } from "@/lib/camera";
import { labelize, purposeLabel, visitTypeLabel } from "@/lib/labels";
import { PURPOSES, VISIT_TYPES, type Purpose, type VisitType } from "@/lib/enums";
import { normalisePlate } from "@/lib/utils";
import { waCallLink } from "@/lib/whatsapp";
import type { Employee } from "@/lib/types";

const QrScanner = dynamic(() => import("./qr-scanner").then((module) => module.QrScanner), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-3xl bg-ink/80" />,
});

interface ScannedVisitor {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  identityType: "nric" | "passport" | null;
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  additionalVehicleNumbers: string[];
  vehicles?: ScannedVehicle[];
  activeVehicleNumber?: string | null;
  typeCode: VisitType;
  purpose: Purpose;
  remarks: string | null;
  visitTime: string | null;
  visitorCount: number | null;
  otherVisitorNames: string[];
  hostStaffId: string | null;
  hostDepartment: string | null;
  host: ScannedHost | null;
  flagReason: string | null;
  checkedIn: string | null;
  status: string;
}

interface ScannedVehicle {
  id: string;
  vehicleNumber: string;
  isPrimary: boolean;
  status: "pending" | "checked_in" | "checked_out" | "cancelled" | "rejected";
  checkedIn: string | null;
  checkedOut: string | null;
  blacklisted?: boolean;
  blacklistReason?: string | null;
}

interface ScannedHost {
  staffId: string;
  name: string;
  department: string;
  phone?: string;
  extension?: string;
  email?: string;
}

interface VisitorDraft {
  name: string;
  phoneNumber: string;
  organisation: string;
  identityType: "nric" | "passport";
  nric: string;
  passportNumber: string;
  vehicleNumber: string;
  additionalVehicleNumbers: string[];
  typeCode: VisitType;
  purpose: Purpose;
  remarks: string;
  visitTime: string;
  visitorCount: string;
  otherVisitorNames: string[];
  hostStaffId: string;
  hostDepartment: string;
  flagReason: string;
}

function toDraft(visitor: ScannedVisitor): VisitorDraft {
  return {
    name: visitor.name,
    phoneNumber: visitor.phoneNumber,
    organisation: visitor.organisation ?? "",
    identityType: visitor.identityType === "passport" ? "passport" : "nric",
    nric: visitor.nric ?? "",
    passportNumber: visitor.passportNumber ?? "",
    vehicleNumber: visitor.vehicleNumber,
    additionalVehicleNumbers: visitor.additionalVehicleNumbers ?? [],
    typeCode: visitor.typeCode,
    purpose: visitor.purpose,
    remarks: visitor.remarks ?? "",
    visitTime: visitor.visitTime ?? "",
    visitorCount: visitor.visitorCount == null ? "" : String(visitor.visitorCount),
    otherVisitorNames: visitor.otherVisitorNames ?? [],
    hostStaffId: visitor.hostStaffId ?? "",
    hostDepartment: visitor.hostDepartment ?? "",
    flagReason: visitor.flagReason ?? "",
  };
}

function parseAdditionalVehicleNumbers(value: string, primaryPlate: string) {
  const primary = primaryPlate.toUpperCase().replace(/[\s-]/g, "");
  const seen = new Set<string>();
  return value
    .split(/[\n,;]+/)
    .map((plate) => plate.trim().toUpperCase().replace(/\s+/g, " "))
    .filter((plate) => {
      if (!plate) return false;
      const normalised = plate.replace(/[\s-]/g, "");
      if (normalised === primary || seen.has(normalised)) return false;
      seen.add(normalised);
      return true;
    });
}

function parseAdditionalVehicleRows(values: string[], primaryPlate: string) {
  return parseAdditionalVehicleNumbers(values.join("\n"), primaryPlate);
}

function parsePastedNames(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function matchesHost(employee: Employee, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [employee.name, employee.staffId, employee.department, employee.email]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function requestedHostFromRemarks(value: string | null) {
  const match = /^Requested host:\s*(.+)$/im.exec(value ?? "");
  return match?.[1]?.trim() ?? "";
}

export function ArrivalScanFlow({ employees = [] }: { employees?: Employee[] }) {
  const [scanning, setScanning] = useState(false);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ScannedVisitor | null>(null);
  const [draft, setDraft] = useState<VisitorDraft | null>(null);
  const [hostQuery, setHostQuery] = useState("");
  const [hostSearchOpen, setHostSearchOpen] = useState(false);
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState("");
  const [checkedIn, setCheckedIn] = useState<ScannedVisitor | null>(null);
  const [submitting, setSubmitting] = useState<{ action: "approve" | "reject"; vehicleNumber: string } | null>(null);

  function startScan() {
    const support = checkCameraSupport();
    setCamMsg(support.ok ? null : support.message || "Camera unavailable.");
    setScanError(null);
    setScanNotice(null);
    setScanning(true);
  }

  async function resolveToken(token: string) {
    setScanError(null);
    setScanNotice(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "review" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to verify this pass.");
      }

      setPendingToken(token);
      setReviewing(payload.visitor);
      setDraft(toDraft(payload.visitor));
      setHostQuery(payload.visitor.host?.name || requestedHostFromRemarks(payload.visitor.remarks) || payload.visitor.hostDepartment || "");
      setHostSearchOpen(false);
      setSelectedVehicleNumber(payload.visitor.vehicles?.find((vehicle: ScannedVehicle) => vehicle.status === "pending")?.vehicleNumber ?? payload.visitor.vehicleNumber);
      setScanning(false);
    } catch (error) {
      setScanning(false);
      setScanError(error instanceof Error ? error.message : "Unable to verify this pass.");
    }
  }

  async function approveArrival(vehicleNumber = selectedVehicleNumber) {
    if (!pendingToken || !draft || !vehicleNumber) return;

    const additionalVehicleNumbers = parseAdditionalVehicleRows(draft.additionalVehicleNumbers, draft.vehicleNumber);
    setSubmitting({ action: "approve", vehicleNumber });
    setSelectedVehicleNumber(vehicleNumber);
    setScanError(null);
    setScanNotice(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingToken,
          action: "check_in",
          vehicleNumber,
          visitor: {
            ...draft,
            additionalVehicleNumbers,
            otherVisitorNames: (Number(draft.visitorCount) || 0) > 1 ? draft.otherVisitorNames : [],
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to approve this arrival.");
      }

      setCheckedIn(payload.visitor);
      setReviewing(null);
      setDraft(null);
      setSelectedVehicleNumber("");
      setPendingToken(null);
      setHostQuery("");
      setHostSearchOpen(false);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to approve this arrival.");
    } finally {
      setSubmitting(null);
    }
  }

  async function rejectArrival(vehicleNumber = selectedVehicleNumber) {
    if (!pendingToken || !vehicleNumber) return;

    setSubmitting({ action: "reject", vehicleNumber });
    setSelectedVehicleNumber(vehicleNumber);
    setScanError(null);
    setScanNotice(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingToken,
          action: "reject",
          vehicleNumber,
          reason: "Rejected during arrival manual verification.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reject this arrival.");
      }

      setReviewing(payload.visitor);
      setDraft(toDraft(payload.visitor));
      const nextPending = payload.visitor.vehicles?.find((vehicle: ScannedVehicle) => vehicle.status === "pending")?.vehicleNumber;
      setSelectedVehicleNumber(nextPending ?? "");
      setScanNotice(`${vehicleNumber} rejected and recorded.`);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to reject this arrival.");
    } finally {
      setSubmitting(null);
    }
  }

  function cancelReview() {
    setReviewing(null);
    setDraft(null);
    setSelectedVehicleNumber("");
    setPendingToken(null);
    setHostQuery("");
    setHostSearchOpen(false);
    setScanError(null);
  }

  function updateDraftVisitorCount(value: string) {
    if (!draft) return;

    const count = Number(value);
    const nextOtherVisitorNames =
      Number.isInteger(count) && count > 1
        ? [
            ...draft.otherVisitorNames.slice(0, count - 1),
            ...Array.from({ length: Math.max(0, count - 1 - draft.otherVisitorNames.length) }, () => ""),
          ]
        : [];

    setDraft({ ...draft, visitorCount: value, otherVisitorNames: nextOtherVisitorNames });
  }

  function addDraftOtherVisitorRow() {
    if (!draft) return;
    const otherVisitorNames = [...draft.otherVisitorNames, ""];
    setDraft({ ...draft, visitorCount: String(otherVisitorNames.length + 1), otherVisitorNames });
  }

  function removeDraftOtherVisitorRow(index: number) {
    if (!draft) return;
    const otherVisitorNames = draft.otherVisitorNames.filter((_, itemIndex) => itemIndex !== index);
    setDraft({
      ...draft,
      visitorCount: otherVisitorNames.length > 0 ? String(otherVisitorNames.length + 1) : "1",
      otherVisitorNames,
    });
  }

  function updateDraftAdditionalVehicleRow(index: number, value: string) {
    if (!draft) return;

    const pastedVehicleNumbers = parseAdditionalVehicleNumbers(value, draft.vehicleNumber);
    if (pastedVehicleNumbers.length > 1) {
      const next = [...draft.additionalVehicleNumbers];
      next.splice(index, 1, ...pastedVehicleNumbers);
      setDraft({ ...draft, additionalVehicleNumbers: parseAdditionalVehicleRows(next, draft.vehicleNumber) });
      return;
    }

    const next = [...draft.additionalVehicleNumbers];
    next[index] = value.toUpperCase();
    setDraft({ ...draft, additionalVehicleNumbers: next });
  }

  function removeDraftAdditionalVehicleRow(index: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      additionalVehicleNumbers: draft.additionalVehicleNumbers.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  const remarksRequired = Boolean(draft && (draft.typeCode === "other" || draft.purpose === "other"));
  const hasIdentityDocument = draft
    ? draft.identityType === "nric"
      ? draft.nric.trim()
      : draft.passportNumber.trim()
    : false;
  const selectedHost = draft ? employees.find((employee) => employee.staffId === draft.hostStaffId) : undefined;
  const cleanAdditionalVehicleNumbers = draft ? parseAdditionalVehicleRows(draft.additionalVehicleNumbers, draft.vehicleNumber) : [];
  const additionalVehicleRowsValid = draft
    ? draft.additionalVehicleNumbers.every((plate) => !plate.trim() || normalisePlate(plate).length >= 3)
    : false;
  const hasConfirmedHost = draft
    ? employees.length > 0
      ? Boolean(selectedHost)
      : Boolean(draft.hostStaffId.trim())
    : false;
  const canSubmitDecision = Boolean(
    pendingToken &&
      draft &&
      draft.vehicleNumber.trim() &&
      draft.name.trim() &&
      draft.phoneNumber.trim() &&
      hasIdentityDocument &&
      hasConfirmedHost &&
      additionalVehicleRowsValid &&
      (!remarksRequired || draft.remarks.trim()) &&
      submitting === null,
  );

  const draftVehicleNumbers = draft ? [draft.vehicleNumber, ...cleanAdditionalVehicleNumbers] : [];
  const hostResults = useMemo(
    () => employees.filter((employee) => matchesHost(employee, hostQuery)).slice(0, 6),
    [employees, hostQuery],
  );
  const requestedHost = requestedHostFromRemarks(draft?.remarks ?? null) || (!selectedHost ? draft?.hostDepartment ?? "" : "");
  const hasMultipleVehicles = draftVehicleNumbers.length > 1;
  const pendingVehicleCount =
    reviewing?.vehicles?.filter((vehicle) => vehicle.status === "pending").length ??
    draftVehicleNumbers.length;
  const blacklistedVehicles = reviewing?.vehicles?.filter((vehicle) => vehicle.blacklisted) ?? [];

  function vehicleBlacklist(vehicleNumber: string) {
    const normalised = normalisePlate(vehicleNumber);
    return reviewing?.vehicles?.find((vehicle) => normalisePlate(vehicle.vehicleNumber) === normalised && vehicle.blacklisted);
  }

  if (checkedIn) {
    return (
      <div className="space-y-5 text-center">
        <div className="flex flex-col items-center gap-1 animate-fade-up">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Arrival checked in</h2>
          <p className="text-sm text-ink-faint">{checkedIn.activeVehicleNumber ?? checkedIn.vehicleNumber} is now on site.</p>
        </div>

        <GlassCard padding="lg" className="mx-auto max-w-sm space-y-3 text-left">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Plate</p>
            <p className="text-3xl font-bold tracking-wide text-ink">{checkedIn.activeVehicleNumber ?? checkedIn.vehicleNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700">Inside</Chip>
            <Chip tone="brand">{visitTypeLabel(checkedIn.typeCode)}</Chip>
          </div>
          <Row label="Main visitor" value={checkedIn.name} />
          <Row label="Contact" value={checkedIn.phoneNumber} />
          {(checkedIn.additionalVehicleNumbers?.length ?? 0) > 0 && (
            <Row label="Other plates" value={checkedIn.additionalVehicleNumbers.join(", ")} />
          )}
          {checkedIn.visitTime && <Row label="Visit time" value={checkedIn.visitTime} />}
          {checkedIn.visitorCount && <Row label="Visitors" value={String(checkedIn.visitorCount)} />}
          {(checkedIn.otherVisitorNames?.length ?? 0) > 0 && (
            <Row label="Additional visitors" value={checkedIn.otherVisitorNames.join(", ")} />
          )}
        </GlassCard>

        <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          <Button variant="glass" onClick={() => setCheckedIn(null)}>Scan next</Button>
          <Link href="/parking">
            <Button className="w-full">Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (reviewing && draft) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-1 text-center animate-fade-up">
          <ShieldCheck className="h-10 w-10 text-brand" />
          <h2 className="text-xl font-bold text-ink">Verify arrival</h2>
          <p className="text-sm text-ink-faint">
            {reviewing.vehicleNumber} · {visitTypeLabel(reviewing.typeCode)}
            {hasMultipleVehicles ? ` · ${pendingVehicleCount} vehicle${pendingVehicleCount === 1 ? "" : "s"} pending` : ""}
          </p>
        </div>

        <GlassCard padding="lg" className="space-y-4">
          {blacklistedVehicles.length > 0 && (
            <div className="rounded-2xl border border-brand/25 bg-brand/10 px-3.5 py-3 text-brand">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Ban className="h-4 w-4 shrink-0" />
                Blacklisted vehicle detected
              </div>
              <p className="mt-1 text-xs font-semibold text-brand/85">
                Do not check in blacklisted vehicles. Contact the duty manager for clearance.
              </p>
              <div className="mt-2 space-y-1.5">
                {blacklistedVehicles.map((vehicle) => (
                  <p key={vehicle.id} className="rounded-2xl bg-white/60 px-3 py-2 text-xs font-semibold text-ink-soft">
                    {vehicle.vehicleNumber}
                    {vehicle.blacklistReason ? ` · ${vehicle.blacklistReason}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Field label="Vehicle plate" required>
            <Input
              value={draft.vehicleNumber}
              onChange={(event) => {
                const vehicleNumber = event.target.value.toUpperCase();
                setDraft({
                  ...draft,
                  vehicleNumber,
                  additionalVehicleNumbers: parseAdditionalVehicleNumbers(draft.additionalVehicleNumbers.join("\n"), vehicleNumber),
                });
              }}
              inputMode="text"
              autoCapitalize="characters"
              className="text-2xl font-bold tracking-wide"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="block text-sm font-semibold text-ink-soft">Additional vehicle plates</span>
                <span className="text-xs font-medium text-ink-faint">
                  {cleanAdditionalVehicleNumbers.length > 0
                    ? `${cleanAdditionalVehicleNumbers.length} linked vehicle${cleanAdditionalVehicleNumbers.length === 1 ? "" : "s"}`
                    : "Add only when the same visitor has another vehicle"}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-dashed bg-white/30"
                onClick={() => setDraft({ ...draft, additionalVehicleNumbers: [...draft.additionalVehicleNumbers, ""] })}
              >
                <Plus className="h-4 w-4" /> Add vehicle
              </Button>
            </div>

            {draft.additionalVehicleNumbers.length > 0 && (
              <div className="space-y-2">
                {draft.additionalVehicleNumbers.map((additionalPlate, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={additionalPlate}
                      onChange={(event) => updateDraftAdditionalVehicleRow(index, event.target.value)}
                      onBlur={() => setDraft({
                        ...draft,
                        additionalVehicleNumbers: parseAdditionalVehicleRows(draft.additionalVehicleNumbers, draft.vehicleNumber),
                      })}
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
                      onClick={() => removeDraftAdditionalVehicleRow(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Vehicle decisions</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {draftVehicleNumbers.map((vehicleNumber) => {
                const existing = reviewing.vehicles?.find((vehicle) => vehicle.vehicleNumber === vehicleNumber);
                const blacklist = vehicleBlacklist(vehicleNumber);
                const status = existing?.status ?? "pending";
                const disabled =
                  status === "checked_in" ||
                  status === "checked_out" ||
                  status === "cancelled" ||
                  status === "rejected" ||
                  Boolean(blacklist);
                const selected = selectedVehicleNumber === vehicleNumber;
                const approving = submitting?.action === "approve" && submitting.vehicleNumber === vehicleNumber;
                const rejecting = submitting?.action === "reject" && submitting.vehicleNumber === vehicleNumber;
                return (
                  <div
                    key={vehicleNumber}
                    className={[
                      "rounded-2xl border p-3 text-left transition",
                      blacklist
                        ? "border-brand/25 bg-brand/10 text-brand"
                        : selected
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-white/60 bg-white/45 text-ink",
                      disabled ? "opacity-70" : "hover:border-brand/40",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedVehicleNumber(vehicleNumber)}
                      className="flex w-full items-center justify-between gap-3"
                    >
                      <span className="truncate text-sm font-bold">{vehicleNumber}</span>
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide">
                        {status === "checked_in"
                          ? "inside"
                          : status === "checked_out"
                            ? "exited"
                            : status === "cancelled"
                              ? "cancelled"
                              : status === "rejected"
                                ? "rejected"
                                : blacklist
                                  ? "blocked"
                                : "pending"}
                      </span>
                    </button>
                    {blacklist && (
                      <p className="mt-2 rounded-2xl bg-white/60 px-3 py-2 text-xs font-semibold text-ink-soft">
                        This vehicle is blacklisted. Reject the arrival and escalate.
                      </p>
                    )}
                    {status === "pending" && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => rejectArrival(vehicleNumber)}
                          disabled={submitting !== null}
                        >
                          <X className="h-4 w-4" /> {rejecting ? "Rejecting..." : "Reject"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => approveArrival(vehicleNumber)}
                          disabled={!canSubmitDecision || submitting !== null || Boolean(blacklist)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> {approving ? "Approving..." : "Approve"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Main visitor" required>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Main visitor contact" required>
              <Input
                value={draft.phoneNumber}
                onChange={(event) => setDraft({ ...draft, phoneNumber: event.target.value })}
                inputMode="tel"
              />
            </Field>
          </div>

          <Field label="Company / organisation">
            <Input
              value={draft.organisation}
              onChange={(event) => setDraft({ ...draft, organisation: event.target.value })}
              placeholder="Company or organisation"
            />
          </Field>

          <Field
            label="Main visitor identity document"
            required
            hint="Only the main visitor needs NRIC/passport details. Additional visitors are recorded by name."
          >
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/40 p-1">
              <button
                type="button"
                className={[
                  "h-10 rounded-xl text-sm font-bold transition",
                  draft.identityType === "nric" ? "bg-white text-brand shadow-sm" : "text-ink-soft",
                ].join(" ")}
                onClick={() => setDraft({ ...draft, identityType: "nric" })}
              >
                NRIC
              </button>
              <button
                type="button"
                className={[
                  "h-10 rounded-xl text-sm font-bold transition",
                  draft.identityType === "passport" ? "bg-white text-brand shadow-sm" : "text-ink-soft",
                ].join(" ")}
                onClick={() => setDraft({ ...draft, identityType: "passport" })}
              >
                Passport
              </button>
            </div>
          </Field>

          {draft.identityType === "nric" ? (
            <Field label="Main visitor NRIC number" required hint="Main visitor only. Format: YYMMDD-PB-####.">
              <Input
                value={draft.nric}
                onChange={(event) => setDraft({ ...draft, nric: event.target.value })}
                placeholder="900101-14-1234"
                required
              />
            </Field>
          ) : (
            <Field label="Main visitor passport number" required hint="Main visitor only.">
              <Input
                value={draft.passportNumber}
                onChange={(event) => setDraft({ ...draft, passportNumber: event.target.value.toUpperCase() })}
                placeholder="Passport number"
                required
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Visit type" required>
              <Select
                value={draft.typeCode}
                onChange={(event) => setDraft({ ...draft, typeCode: event.target.value as VisitType })}
              >
                {VISIT_TYPES.map((type) => (
                  <option key={type} value={type}>{labelize(type)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Purpose" required>
              <Select
                value={draft.purpose}
                onChange={(event) => setDraft({ ...draft, purpose: event.target.value as Purpose })}
              >
                {PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>{purposeLabel(purpose)}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Visit time">
              <Input
                value={draft.visitTime}
                onChange={(event) => setDraft({ ...draft, visitTime: event.target.value })}
                type="time"
              />
            </Field>
            <Field label="Number of visitors">
              <Input
                value={draft.visitorCount}
                onChange={(event) => updateDraftVisitorCount(event.target.value)}
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                placeholder="e.g. 3"
              />
            </Field>
          </div>

          {(Number(draft.visitorCount) || 0) > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-ink-soft">Additional visitors</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-dashed bg-white/30"
                  onClick={addDraftOtherVisitorRow}
                >
                  <Plus className="h-4 w-4" /> Add visitor
                </Button>
              </div>

              <div className="space-y-2">
                {draft.otherVisitorNames.map((otherVisitorName, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={otherVisitorName}
                      onChange={(event) => {
                        const pastedNames = parsePastedNames(event.target.value);
                        if (pastedNames.length > 1) {
                          const next = [...draft.otherVisitorNames];
                          next.splice(index, 1, ...pastedNames);
                          setDraft({ ...draft, visitorCount: String(next.length + 1), otherVisitorNames: next });
                          return;
                        }

                        const next = [...draft.otherVisitorNames];
                        next[index] = event.target.value;
                        setDraft({ ...draft, otherVisitorNames: next });
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
                      onClick={() => removeDraftOtherVisitorRow(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {requestedHost && (
              <div className="rounded-2xl bg-white/45 px-3.5 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Requested host</p>
                <p className="mt-1 text-sm font-semibold text-ink">{requestedHost}</p>
              </div>
            )}

            <span className="block text-sm font-semibold text-ink-soft">
              Assign confirmed host <span className="text-brand">*</span>
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={hostQuery}
                onChange={(event) => {
                  setHostQuery(event.target.value);
                  setDraft({ ...draft, hostStaffId: "", hostDepartment: "" });
                  setHostSearchOpen(true);
                }}
                onFocus={() => setHostSearchOpen(true)}
                placeholder="Search host name or department"
                className="pl-11"
                role="combobox"
                aria-label={`Assign host for ${draft.vehicleNumber}`}
                aria-expanded={hostSearchOpen}
                aria-required="true"
              />
              {hostQuery && (
                <button
                  type="button"
                  aria-label="Clear host"
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-white/70 hover:text-brand"
                  onClick={() => {
                    setHostQuery("");
                    setDraft({ ...draft, hostStaffId: "", hostDepartment: "" });
                    setHostSearchOpen(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {hostSearchOpen && (
              <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-lift backdrop-blur-md">
                {hostResults.length > 0 ? (
                  hostResults.map((host) => (
                    <button
                      key={host.staffId}
                      type="button"
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-brand/5 focus:bg-brand/5 focus:outline-none"
                      onClick={() => {
                        setDraft({ ...draft, hostStaffId: host.staffId, hostDepartment: host.department });
                        setHostQuery(host.name);
                        setHostSearchOpen(false);
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

            {selectedHost && <HostContactBlock host={selectedHost} />}
          </div>

          <Field
            label="Remarks"
            required={remarksRequired}
            hint={remarksRequired ? "Required when visit type or purpose is Other." : "Optional notes for the visit."}
          >
            <Textarea
              value={draft.remarks}
              onChange={(event) => setDraft({ ...draft, remarks: event.target.value })}
              placeholder="Add notes for the guard, if needed"
              required={remarksRequired}
            />
          </Field>

          {draft.flagReason && (
            <div className="rounded-2xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">
              {draft.flagReason}
            </div>
          )}
        </GlassCard>

        {scanError && (
          <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
            {scanError}
          </p>
        )}

        <Button variant="glass" className="w-full" onClick={cancelReview} disabled={submitting !== null}>
          Scan another pass
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scanning ? (
        <div className="space-y-3">
          {camMsg ? (
            <GlassCard padding="lg" className="flex flex-col items-center gap-3 text-center">
              <CameraOff className="h-9 w-9 text-ink-faint" />
              <p className="text-sm text-ink-soft">{camMsg}</p>
              <Button variant="outline" size="sm" onClick={startScan}>Retry camera</Button>
            </GlassCard>
          ) : (
            <QrScanner onResult={resolveToken} onError={setCamMsg} />
          )}
          <Button variant="glass" className="w-full" onClick={() => { setScanning(false); setCamMsg(null); }}>
            <X className="h-4 w-4" /> Cancel scan
          </Button>
        </div>
      ) : (
        <Button size="xl" className="w-full" onClick={startScan}>
          <ScanLine className="h-6 w-6" /> Scan arrival QR
        </Button>
      )}

      {scanError && (
        <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {scanError}
        </p>
      )}
      {scanNotice && (
        <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
          {scanNotice}
        </p>
      )}

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Arrival scan accepts pre-registered QR passes only for check-in. Use Log Exit when the vehicle leaves.
        </p>
      </GlassCard>
    </div>
  );
}

function HostContactBlock({
  host,
  fallbackStaffId,
  fallbackDepartment,
}: {
  host?: ScannedHost;
  fallbackStaffId?: string;
  fallbackDepartment?: string;
}) {
  const whatsappCallHref = host?.phone ? waCallLink(host.phone) : null;

  return (
    <div className="rounded-2xl border border-white/60 bg-white/45 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">WhatsApp host to confirm</p>
          <p className="mt-1 truncate text-sm font-bold text-ink">{host?.name ?? fallbackStaffId ?? "Host not found"}</p>
          <p className="text-xs text-ink-faint">{host?.department ?? fallbackDepartment ?? "Department unavailable"}</p>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            {host?.phone ?? "No phone number in HR directory"}
            {host?.extension ? ` · Ext ${host.extension}` : ""}
          </p>
        </div>
        {whatsappCallHref && (
          <a
            href={whatsappCallHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/30 bg-white/50 px-3 py-1.5 text-xs font-bold text-brand"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp Call
          </a>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/50 py-1.5 last:border-0">
      <span className="text-sm text-ink-faint">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
