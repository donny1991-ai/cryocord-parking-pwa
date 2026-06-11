"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Send, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { PURPOSES, type Purpose } from "@/lib/enums";
import { purposeLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { QrPass } from "./qr-pass";
import { QrPassShareButton } from "./qr-pass-share-button";

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseNames(values: string[]) {
  return values.map(cleanName).filter(Boolean);
}

export function PublicVisitorRequestForm() {
  const [issuedPass, setIssuedPass] = useState<{
    token: string;
    tokenExpiresAt: string;
    plate: string;
    visitorName: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [requestedHostText, setRequestedHostText] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("meeting");
  const [visitorCount, setVisitorCount] = useState("");
  const [otherVisitorRows, setOtherVisitorRows] = useState<string[]>([]);
  const [identityType, setIdentityType] = useState<"nric" | "passport">("nric");
  const [nric, setNric] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const otherVisitorNames = useMemo(() => parseNames(otherVisitorRows), [otherVisitorRows]);
  const canSubmit = Boolean(
    name.trim() &&
    phoneNumber.trim() &&
    requestedHostText.trim() &&
    vehicleNumber.trim() &&
    (identityType === "nric" ? nric.trim() : passportNumber.trim()),
  );

  function updateVisitorCount(value: string) {
    setVisitorCount(value);
    const count = Number(value);
    if (!Number.isInteger(count) || count <= 1) {
      setOtherVisitorRows([]);
      return;
    }

    const target = count - 1;
    setOtherVisitorRows((rows) => {
      if (rows.length === target) return rows;
      if (rows.length > target) return rows.slice(0, target);
      return [...rows, ...Array.from({ length: target - rows.length }, () => "")];
    });
  }

  function addOtherVisitor() {
    const next = [...otherVisitorRows, ""];
    setOtherVisitorRows(next);
    setVisitorCount(String(next.length + 1));
  }

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/public/visitor-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phoneNumber,
          organisation: organisation || undefined,
          requestedHostText,
          vehicleNumber,
          purpose,
          visitorCount: visitorCount || undefined,
          otherVisitorNames: otherVisitorNames.length > 0 ? otherVisitorNames : undefined,
          identityType,
          nric: identityType === "nric" ? nric : undefined,
          passportNumber: identityType === "passport" ? passportNumber : undefined,
          remarks: remarks || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit registration.");
      }
      if (!payload.token || !payload.tokenExpiresAt || !payload.visitor?.vehicleNumber) {
        throw new Error("Registration was submitted, but the QR pass could not be prepared.");
      }

      setIssuedPass({
        token: String(payload.token ?? ""),
        tokenExpiresAt: String(payload.tokenExpiresAt ?? ""),
        plate: String(payload.visitor?.vehicleNumber ?? vehicleNumber).trim().toUpperCase(),
        visitorName: String(payload.visitor?.name ?? name).trim(),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit registration.");
    } finally {
      setSubmitting(false);
    }
  }

  if (issuedPass) {
    const validUntil = issuedPass.tokenExpiresAt ? formatDateTime(issuedPass.tokenExpiresAt) : "today";

    return (
      <div className="space-y-4">
        <GlassCard padding="lg" className="space-y-4 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Registration submitted</p>
            <h1 className="mt-2 text-2xl font-bold text-ink">{issuedPass.plate}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Save this QR picture and show it to security. A guard will scan it, verify your details, and assign the confirmed host before entry.
            </p>
          </div>
        </GlassCard>

        <QrPass
          token={issuedPass.token}
          plate={issuedPass.plate}
          visitorName={issuedPass.visitorName}
          visitType="visitor"
          validUntil={validUntil}
          heading="Scan at gate before entering"
        />

        <QrPassShareButton
          token={issuedPass.token}
          plate={issuedPass.plate}
          visitorName={issuedPass.visitorName}
          visitType="visitor"
          validUntil={validUntil}
          heading="Visitor e-Check-In"
          message="Please show this QR pass to security at the gate."
          buttonLabel="Save QR picture"
        />

        <Button type="button" variant="outline" className="w-full" onClick={() => setIssuedPass(null)}>
          Submit another visitor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">CryoCord visitor registration</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight text-ink">Entry request</h1>
        <p className="mt-1 text-sm text-ink-soft">Security will verify this before issuing access.</p>
      </div>

      <GlassCard padding="lg" className="space-y-4">
        <Field label="Main visitor name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" autoComplete="name" />
        </Field>
        <Field label="Contact number" required>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+60..."
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label="Company / organisation">
          <Input
            value={organisation}
            onChange={(event) => setOrganisation(event.target.value)}
            placeholder="Company name"
            autoComplete="organization"
          />
        </Field>
        <Field label="Person or department to visit" required>
          <Input
            value={requestedHostText}
            onChange={(event) => setRequestedHostText(event.target.value)}
            placeholder="Example: Dr. Lim / Lab team"
          />
        </Field>
        <Field label="Vehicle plate" required>
          <Input
            value={vehicleNumber}
            onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            placeholder="WA 18 K"
            autoCapitalize="characters"
            className="font-bold tracking-wide"
          />
        </Field>
        <Field label="Purpose" required>
          <Select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)}>
            {PURPOSES.map((item) => (
              <option key={item} value={item}>
                {purposeLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Number of visitors">
          <Input
            value={visitorCount}
            onChange={(event) => updateVisitorCount(event.target.value)}
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="1"
          />
        </Field>

        {otherVisitorRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink-soft">Additional visitors</span>
              <Button type="button" variant="outline" size="sm" className="border-dashed bg-white/30" onClick={addOtherVisitor}>
                <Plus className="h-4 w-4" /> Add visitor
              </Button>
            </div>
            <div className="space-y-2">
              {otherVisitorRows.map((visitorName, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={visitorName}
                    onChange={(event) => {
                      const next = [...otherVisitorRows];
                      next[index] = event.target.value;
                      setOtherVisitorRows(next);
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
                    onClick={() => {
                      const next = otherVisitorRows.filter((_, itemIndex) => itemIndex !== index);
                      setOtherVisitorRows(next);
                      setVisitorCount(next.length > 0 ? String(next.length + 1) : "1");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field
          label="Main visitor identity document"
          required
          hint="Only the main visitor needs NRIC/passport details."
        >
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/40 p-1">
            <button
              type="button"
              className={`h-10 rounded-xl text-sm font-bold transition ${
                identityType === "nric" ? "bg-white text-brand shadow-sm" : "text-ink-soft"
              }`}
              onClick={() => setIdentityType("nric")}
            >
              NRIC
            </button>
            <button
              type="button"
              className={`h-10 rounded-xl text-sm font-bold transition ${
                identityType === "passport" ? "bg-white text-brand shadow-sm" : "text-ink-soft"
              }`}
              onClick={() => setIdentityType("passport")}
            >
              Passport
            </button>
          </div>
        </Field>

        {identityType === "nric" ? (
          <Field label="Main visitor NRIC number" required hint="Format: YYMMDD-PB-####.">
            <Input value={nric} onChange={(event) => setNric(event.target.value)} placeholder="900101-14-1234" />
          </Field>
        ) : (
          <Field label="Main visitor passport number" required>
            <Input
              value={passportNumber}
              onChange={(event) => setPassportNumber(event.target.value.toUpperCase())}
              placeholder="Passport number"
              autoCapitalize="characters"
            />
          </Field>
        )}

        <Field label="Notes">
          <Textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Any information security should know"
          />
        </Field>
      </GlassCard>

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Your details are used for premises security and access control. Security will confirm your host before entry.
        </p>
      </GlassCard>

      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">{error}</p>}

      <Button type="button" size="xl" className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
        <Send className="h-5 w-5" />
        {submitting ? "Submitting..." : "Submit registration"}
      </Button>
    </div>
  );
}
