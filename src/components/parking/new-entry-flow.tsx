"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, CheckCircle2, Pencil, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
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
  const [visitType, setVisitType] = useState<VisitType>("guest");
  const [purpose, setPurpose] = useState<Purpose>("meeting");
  const [purposeNotes, setPurposeNotes] = useState("");
  const [hostStaffId, setHostStaffId] = useState("");
  const [showIc, setShowIc] = useState(false);
  const [visitorIc, setVisitorIc] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [issued, setIssued] = useState<{ id: string; token: string; tokenExpiresAt: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

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

  const canIssue = plate && visitorName.trim() && visitorContact.trim() && (purpose !== "other" || purposeNotes.trim());

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
          vehicleNumber: plate,
          typeCode: visitType,
          purpose,
          remarks: purposeNotes || undefined,
          hostStaffId: hostStaffId || undefined,
          hostDepartment: employees.find((employee) => employee.staffId === hostStaffId)?.department,
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

        {(purpose === "other") && (
          <Field label="Purpose notes" required hint="Required when purpose is Other.">
            <Input value={purposeNotes} onChange={(e) => setPurposeNotes(e.target.value)} placeholder="Describe the purpose" />
          </Field>
        )}

        <Field label="Host" hint="Who they're visiting (from the employee directory).">
          <Select value={hostStaffId} onChange={(e) => setHostStaffId(e.target.value)}>
            <option value="">— Select host —</option>
            {employees.map((e) => (
              <option key={e.staffId} value={e.staffId}>{e.name} · {e.department}</option>
            ))}
          </Select>
        </Field>

        {/* PII minimisation — IC off by default */}
        {!showIc ? (
          <button onClick={() => setShowIc(true)} className="text-xs font-semibold text-brand">
            + Add IC number (optional)
          </button>
        ) : (
          <Field label="IC number (optional)" hint="PDPA-sensitive — collect only if required.">
            <Input value={visitorIc} onChange={(e) => setVisitorIc(e.target.value)} placeholder="######-##-####" />
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
