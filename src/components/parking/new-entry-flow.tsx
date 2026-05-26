"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CarFront,
  CheckCircle2,
  Check,
  Copy,
  ClipboardList,
  IdCard,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Chip } from "@/components/ui/badge";
import { PlateCapture } from "./plate-capture";
import { QrPass } from "./qr-pass";
import { VISIT_TYPES, PURPOSES, type VisitType, type Purpose } from "@/lib/enums";
import { labelize } from "@/lib/labels";
import { data } from "@/lib/data";
import { cn } from "@/lib/utils";
import { createDemoPassToken } from "@/lib/pass-token";
import { buildPassMessage, waLink, waShareLink } from "@/lib/whatsapp";

type Step = "capture" | "form" | "pass";
type IssuedPass = ReturnType<typeof createDemoPassToken>;

export function NewEntryFlow() {
  const [step, setStep] = useState<Step>("capture");
  const [plate, setPlate] = useState("");
  const employees = data.employees();

  const known = useMemo(() => (plate ? data.getVehicleByPlate(plate) : undefined), [plate]);

  const [visitorName, setVisitorName] = useState("");
  const [visitorContact, setVisitorContact] = useState("");
  const [visitType, setVisitType] = useState<VisitType>("visitor");
  const [purpose, setPurpose] = useState<Purpose>("meeting");
  const [purposeNotes, setPurposeNotes] = useState("");
  const [hostStaffId, setHostStaffId] = useState("");
  const [showIc, setShowIc] = useState(false);
  const [visitorIc, setVisitorIc] = useState("");
  const [origin, setOrigin] = useState("");
  const [copiedPassLink, setCopiedPassLink] = useState(false);
  const [issued, setIssued] = useState<IssuedPass | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  function selectPlate(p: string) {
    setPlate(p);
    setIssued(null);
    setCopiedPassLink(false);
    const veh = data.getVehicleByPlate(p);
    if (veh) {
      if (veh.ownerName && veh.ownerName !== "Unknown") setVisitorName(veh.ownerName);
      if (veh.ownerContact) setVisitorContact(veh.ownerContact);
      if (veh.ownerType && (VISIT_TYPES as readonly string[]).includes(veh.ownerType)) {
        setVisitType(veh.ownerType as VisitType);
      }
    }
    setStep("form");
  }

  const canIssue = plate && visitorName.trim() && (purpose !== "other" || purposeNotes.trim());

  function issuePass() {
    // Demo issuance. Production: a server action writes the visit via withAudit()
    // (same-transaction audit row) and returns the signed opaque token.
    setIssued(createDemoPassToken());
    setCopiedPassLink(false);
    setStep("pass");
  }

  if (step === "capture") {
    return (
      <div className="space-y-4">
        <StepDots step={1} />
        <PlateCapture onPlate={selectPlate} />
      </div>
    );
  }

  if (step === "pass") {
    if (!issued) return null;
    const passUrl = origin ? `${origin}/pass/${encodeURIComponent(issued.token)}` : undefined;
    const passValue = passUrl ?? issued.token;
    const passMessage = buildPassMessage({ visitorName, plate, visitType, validUntil: "24 Aug 2026", passUrl });
    const waHref = waLink(visitorContact, passMessage) ?? waShareLink(passMessage);

    async function copyPassLink() {
      if (!passUrl) return;
      await navigator.clipboard.writeText(passUrl);
      setCopiedPassLink(true);
      window.setTimeout(() => setCopiedPassLink(false), 1800);
    }

    return (
      <div className="space-y-5 pb-28">
        <div className="flex flex-col items-center gap-1 text-center animate-fade-up">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Pass issued</h2>
          <p className="text-sm text-ink-faint">Share this QR pass with the visitor.</p>
        </div>
        <QrPass
          value={passValue}
          plate={plate}
          visitorName={visitorName}
          visitType={visitType}
          validUntil="24 Aug 2026"
        />
        <div className="sticky bottom-24 z-20 mx-auto flex max-w-md flex-col gap-2.5 rounded-[1.5rem] border border-white/60 bg-white/78 p-2.5 shadow-glass backdrop-blur-xl">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "primary", size: "lg" }), "w-full")}
          >
            <Send className="h-4 w-4" /> Send via WhatsApp
          </a>
          <p className="-mt-1 text-center text-[11px] text-ink-faint">
            {waLink(visitorContact, passMessage)
              ? "Opens WhatsApp with the visitor number and message ready."
              : "Opens WhatsApp with the message ready; choose or type the recipient."}
          </p>
          <Button
            variant="outline"
            size="lg"
            className="w-full bg-white/65"
            disabled={!passUrl}
            onClick={copyPassLink}
          >
            {copiedPassLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedPassLink ? "Pass link copied" : "Copy pass link"}
          </Button>
          <Link href="/parking">
            <Button variant="ghost" className="h-9 w-full text-xs">Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  // step === "form"
  return (
    <div className="space-y-5 pb-6">
      <StepDots step={2} />

      {/* Plate header */}
      <GlassCard padding="md" className="overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-glass-red">
              <CarFront className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Captured plate</p>
              <p className="truncate text-3xl font-black tracking-[0.08em] text-ink">{plate}</p>
            </div>
          </div>
          <button
            onClick={() => setStep("capture")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-tint px-3 py-2 text-xs font-bold text-brand transition-colors hover:bg-brand/15"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-scan
          </button>
        </div>
      </GlassCard>

      {known && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm",
            known.blacklisted
              ? "border-brand/25 bg-brand/10 text-brand"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
          )}
        >
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-ink">Visitor details</p>
            <p className="text-xs text-ink-faint">Only the required pass fields stay up front.</p>
          </div>
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">
            Required
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Visitor name" required>
            <Input
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="Full name"
              icon={<UserRound className="h-4 w-4" />}
            />
          </Field>
          <Field label="Contact number" hint="Optional. If blank, WhatsApp opens so you can choose or type the recipient.">
            <Input
              value={visitorContact}
              onChange={(e) => setVisitorContact(e.target.value)}
              placeholder="+60…"
              inputMode="tel"
              icon={<Phone className="h-4 w-4" />}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
            <Input
              value={purposeNotes}
              onChange={(e) => setPurposeNotes(e.target.value)}
              placeholder="Describe the purpose"
              icon={<ClipboardList className="h-4 w-4" />}
            />
          </Field>
        )}

        <div className="space-y-3 border-t border-white/55 pt-4">
          <div>
            <p className="text-sm font-black text-ink">Optional context</p>
            <p className="text-xs text-ink-faint">Useful for reception and audit, hidden from pass validation.</p>
          </div>

          <Field label="Host">
            <Select value={hostStaffId} onChange={(e) => setHostStaffId(e.target.value)}>
              <option value="">Select host if known</option>
              {employees.map((e) => (
                <option key={e.staffId} value={e.staffId}>{e.name} · {e.department}</option>
              ))}
            </Select>
          </Field>

          {/* PII minimisation — IC off by default */}
          {!showIc ? (
            <button
              onClick={() => setShowIc(true)}
              className="inline-flex items-center gap-2 rounded-full bg-white/50 px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-white/75 hover:text-brand"
            >
              <IdCard className="h-3.5 w-3.5" />
              Add IC number only if required
            </button>
          ) : (
            <Field label="IC number" hint="PDPA-sensitive — collect only if required.">
              <Input
                value={visitorIc}
                onChange={(e) => setVisitorIc(e.target.value)}
                placeholder="######-##-####"
                icon={<IdCard className="h-4 w-4" />}
              />
            </Field>
          )}
        </div>
      </GlassCard>

      {/* Consent notice */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-white/45 px-3.5 py-3 backdrop-blur-md">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Data collected for premises security and access control. Retained 90 days; stored in
          Malaysia (Azure MY West). Refer to the CryoCord Privacy Policy.
        </p>
      </div>

      <Button size="xl" className="w-full" disabled={!canIssue} onClick={issuePass}>
        <Sparkles className="h-5 w-5" />
        Issue Pass
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
