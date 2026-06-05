"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CameraOff, CheckCircle2, LogIn, ScanLine, ShieldCheck, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { checkCameraSupport } from "@/lib/camera";
import { labelize, purposeLabel, visitTypeLabel } from "@/lib/labels";
import { PURPOSES, VISIT_TYPES, type Purpose, type VisitType } from "@/lib/enums";

const QrScanner = dynamic(() => import("./qr-scanner").then((module) => module.QrScanner), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-3xl bg-ink/80" />,
});

interface ScannedVisitor {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  vehicleNumber: string;
  typeCode: VisitType;
  purpose: Purpose;
  remarks: string | null;
  hostStaffId: string | null;
  hostDepartment: string | null;
  flagReason: string | null;
  checkedIn: string | null;
  status: string;
}

interface VisitorDraft {
  name: string;
  phoneNumber: string;
  organisation: string;
  vehicleNumber: string;
  typeCode: VisitType;
  purpose: Purpose;
  remarks: string;
  hostStaffId: string;
  hostDepartment: string;
  flagReason: string;
}

function toDraft(visitor: ScannedVisitor): VisitorDraft {
  return {
    name: visitor.name,
    phoneNumber: visitor.phoneNumber,
    organisation: visitor.organisation ?? "",
    vehicleNumber: visitor.vehicleNumber,
    typeCode: visitor.typeCode,
    purpose: visitor.purpose,
    remarks: visitor.remarks ?? "",
    hostStaffId: visitor.hostStaffId ?? "",
    hostDepartment: visitor.hostDepartment ?? "",
    flagReason: visitor.flagReason ?? "",
  };
}

export function ArrivalScanFlow() {
  const [scanning, setScanning] = useState(false);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ScannedVisitor | null>(null);
  const [draft, setDraft] = useState<VisitorDraft | null>(null);
  const [checkedIn, setCheckedIn] = useState<ScannedVisitor | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);

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
      setScanning(false);
    } catch (error) {
      setScanning(false);
      setScanError(error instanceof Error ? error.message : "Unable to verify this pass.");
    }
  }

  async function approveArrival() {
    if (!pendingToken || !draft) return;

    setSubmitting("approve");
    setScanError(null);
    setScanNotice(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingToken,
          action: "check_in",
          visitor: draft,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to approve this arrival.");
      }

      setCheckedIn(payload.visitor);
      setReviewing(null);
      setDraft(null);
      setPendingToken(null);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to approve this arrival.");
    } finally {
      setSubmitting(null);
    }
  }

  async function rejectArrival() {
    if (!pendingToken) return;

    setSubmitting("reject");
    setScanError(null);
    setScanNotice(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: pendingToken,
          action: "reject",
          reason: "Rejected during arrival manual verification.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to reject this arrival.");
      }

      setReviewing(null);
      setDraft(null);
      setPendingToken(null);
      setScanNotice("Arrival rejected and recorded.");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Unable to reject this arrival.");
    } finally {
      setSubmitting(null);
    }
  }

  function cancelReview() {
    setReviewing(null);
    setDraft(null);
    setPendingToken(null);
    setScanError(null);
  }

  const canApprove = Boolean(
    pendingToken &&
      draft?.vehicleNumber.trim() &&
      draft.name.trim() &&
      draft.phoneNumber.trim() &&
      ((draft.typeCode !== "other" && draft.purpose !== "other") || draft.remarks.trim()) &&
      submitting === null,
  );

  if (checkedIn) {
    return (
      <div className="space-y-5 text-center">
        <div className="flex flex-col items-center gap-1 animate-fade-up">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Arrival checked in</h2>
          <p className="text-sm text-ink-faint">{checkedIn.vehicleNumber} is now on site.</p>
        </div>

        <GlassCard padding="lg" className="mx-auto max-w-sm space-y-3 text-left">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Plate</p>
            <p className="text-3xl font-bold tracking-wide text-ink">{checkedIn.vehicleNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700">Inside</Chip>
            <Chip tone="brand">{visitTypeLabel(checkedIn.typeCode)}</Chip>
          </div>
          <Row label="Visitor" value={checkedIn.name} />
          <Row label="Contact" value={checkedIn.phoneNumber} />
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
          <p className="text-sm text-ink-faint">{reviewing.vehicleNumber} · {visitTypeLabel(reviewing.typeCode)}</p>
        </div>

        <GlassCard padding="lg" className="space-y-4">
          <Field label="Vehicle plate" required>
            <Input
              value={draft.vehicleNumber}
              onChange={(event) => setDraft({ ...draft, vehicleNumber: event.target.value.toUpperCase() })}
              inputMode="text"
              autoCapitalize="characters"
              className="text-2xl font-bold tracking-wide"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Visitor" required>
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Contact" required>
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
            <Field label="Host ID">
              <Input value={draft.hostStaffId} onChange={(event) => setDraft({ ...draft, hostStaffId: event.target.value })} />
            </Field>
            <Field label="Host department">
              <Input
                value={draft.hostDepartment}
                onChange={(event) => setDraft({ ...draft, hostDepartment: event.target.value })}
              />
            </Field>
          </div>

          {(draft.typeCode === "other" || draft.purpose === "other") && (
            <Field label="Notes / remarks" required>
              <Textarea
                value={draft.remarks}
                onChange={(event) => setDraft({ ...draft, remarks: event.target.value })}
                placeholder="Add required details for Other"
              />
            </Field>
          )}

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

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={rejectArrival} disabled={submitting !== null}>
            <X className="h-4 w-4" /> {submitting === "reject" ? "Rejecting..." : "Reject"}
          </Button>
          <Button onClick={approveArrival} disabled={!canApprove}>
            <CheckCircle2 className="h-4 w-4" /> {submitting === "approve" ? "Approving..." : "Approve"}
          </Button>
        </div>

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/50 py-1.5 last:border-0">
      <span className="text-sm text-ink-faint">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
