"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarPlus, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { QrPass } from "./qr-pass";
import { PURPOSES, VISIT_TYPES, type Purpose, type VisitType } from "@/lib/enums";
import { labelize } from "@/lib/labels";
import { buildPassMessage, waLink } from "@/lib/whatsapp";
import { cn, normalisePlate } from "@/lib/utils";
import type { Employee, Vehicle } from "@/lib/types";

type Step = "form" | "pass";

export interface PreRegisterInitialValues {
  plate?: string;
  visitorName?: string;
  visitorContact?: string;
  visitType?: VisitType;
  purpose?: Purpose;
  purposeNotes?: string;
  hostStaffId?: string;
}

export function PreRegisterFlow({
  employees,
  vehicles,
  initialValues,
}: {
  employees: Employee[];
  vehicles: Vehicle[];
  initialValues?: PreRegisterInitialValues;
}) {
  const [step, setStep] = useState<Step>("form");
  const [plate, setPlate] = useState(initialValues?.plate ?? "");
  const [visitorName, setVisitorName] = useState(initialValues?.visitorName ?? "");
  const [visitorContact, setVisitorContact] = useState(initialValues?.visitorContact ?? "");
  const [visitType, setVisitType] = useState<VisitType>(initialValues?.visitType ?? "guest");
  const [purpose, setPurpose] = useState<Purpose>(initialValues?.purpose ?? "meeting");
  const [purposeNotes, setPurposeNotes] = useState(initialValues?.purposeNotes ?? "");
  const [hostStaffId, setHostStaffId] = useState(initialValues?.hostStaffId ?? "");
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const known = useMemo(() => {
    const normalised = normalisePlate(plate);
    return normalised ? vehicles.find((vehicle) => vehicle.plateNormalised === normalised) : undefined;
  }, [plate, vehicles]);

  function updatePlate(value: string) {
    setPlate(value.toUpperCase());
    const normalised = normalisePlate(value);
    const vehicle = vehicles.find((item) => item.plateNormalised === normalised);
    if (!vehicle) return;
    if (vehicle.ownerName && vehicle.ownerName !== "Unknown") setVisitorName(vehicle.ownerName);
    if (vehicle.ownerContact) setVisitorContact(vehicle.ownerContact);
    if (vehicle.ownerType && (VISIT_TYPES as readonly string[]).includes(vehicle.ownerType)) {
      setVisitType(vehicle.ownerType as VisitType);
    }
  }

  const canIssue =
    normalisePlate(plate).length >= 3 &&
    visitorName.trim() &&
    visitorContact.trim() &&
    (purpose !== "other" || purposeNotes.trim());

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
          flagReason: known?.blacklisted ? "Plate matched the vehicle blacklist during pre-registration." : undefined,
          checkInOnCreate: false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Visitor pass could not be saved.");
      }

      const payload = await response.json();
      setIssued({ id: payload.visitor.id, token: payload.token });
      setStep("pass");
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Visitor pass could not be saved.");
    } finally {
      setIssuing(false);
    }
  }

  if (step === "pass" && issued) {
    const passUrl = origin ? `${origin}/pass/${encodeURIComponent(issued.token)}` : undefined;
    const waHref = waLink(
      visitorContact,
      buildPassMessage({ visitorName, plate, visitType, validUntil: "24 Aug 2026", passUrl }),
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-1 text-center animate-fade-up">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Pass ready</h2>
          <p className="text-sm text-ink-faint">Send this QR to the visitor. Scan it on arrival to check in.</p>
        </div>
        <QrPass
          token={issued.token}
          plate={plate}
          visitorName={visitorName}
          visitType={visitType}
          validUntil="24 Aug 2026"
          heading="Scan at gate to check in"
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
            <Button variant="outline" className="w-full" disabled>
              <Send className="h-4 w-4" /> Send via WhatsApp
            </Button>
          )}
          <Link href="/parking">
            <Button variant="glass" className="w-full">Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard padding="lg" className="space-y-4">
        <Field label="Vehicle plate" required>
          <Input
            value={plate}
            onChange={(event) => updatePlate(event.target.value)}
            placeholder="e.g. WA 18 K"
            inputMode="text"
            autoCapitalize="characters"
            className="font-bold tracking-wide"
          />
        </Field>

        {known && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            <span>
              {known.blacklisted ? (
                <span className="font-bold text-brand">Blacklisted vehicle - escalate to duty manager.</span>
              ) : (
                <>Known vehicle - details pre-filled from registry.</>
              )}
            </span>
          </div>
        )}

        <Field label="Visitor name" required>
          <Input value={visitorName} onChange={(event) => setVisitorName(event.target.value)} placeholder="Full name" />
        </Field>

        <Field label="Contact number" required>
          <Input
            value={visitorContact}
            onChange={(event) => setVisitorContact(event.target.value)}
            placeholder="+60..."
            inputMode="tel"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Visit type" required>
            <Select value={visitType} onChange={(event) => setVisitType(event.target.value as VisitType)}>
              {VISIT_TYPES.map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Purpose" required>
            <Select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)}>
              {PURPOSES.map((item) => (
                <option key={item} value={item}>{labelize(item)}</option>
              ))}
            </Select>
          </Field>
        </div>

        {purpose === "other" && (
          <Field label="Purpose notes" required>
            <Input
              value={purposeNotes}
              onChange={(event) => setPurposeNotes(event.target.value)}
              placeholder="Describe the purpose"
            />
          </Field>
        )}

        <Field label="Host">
          <Select value={hostStaffId} onChange={(event) => setHostStaffId(event.target.value)}>
            <option value="">- Select host -</option>
            {employees.map((employee) => (
              <option key={employee.staffId} value={employee.staffId}>
                {employee.name} - {employee.department}
              </option>
            ))}
          </Select>
        </Field>
      </GlassCard>

      <div className="flex items-start gap-2.5 rounded-2xl bg-white/45 px-3.5 py-3 backdrop-blur-md">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Pre-registered passes stay pending until a guard scans the QR at arrival.
        </p>
      </div>

      {issueError && (
        <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {issueError}
        </p>
      )}

      <Button size="xl" className="w-full" disabled={!canIssue || issuing} onClick={issuePass}>
        <CalendarPlus className="h-5 w-5" />
        {issuing ? "Creating..." : "Create Pre-registered Pass"}
      </Button>
    </div>
  );
}
