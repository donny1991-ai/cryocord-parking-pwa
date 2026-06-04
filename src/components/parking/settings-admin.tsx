"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Save, ShieldCheck, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Input } from "@/components/ui/input";
import type { ParkingAdminSettings } from "@/lib/server/admin-settings";

export function SettingsAdmin({ settings }: { settings: ParkingAdminSettings }) {
  const [authSessionExpiresHours, setAuthSessionExpiresHours] = useState(String(settings.authSessionExpiresHours));
  const [overstayAllowedDays, setOverstayAllowedDays] = useState(String(settings.overstayAllowedDays));
  const [saved, setSaved] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authSessionExpiresHours: Number(authSessionExpiresHours),
          overstayAllowedDays: Number(overstayAllowedDays),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save settings.");
      }
      setSaved(payload.settings);
      setNotice("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <GlassCard padding="sm" className="rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            <Clock3 className="h-3.5 w-3.5" />
            Token
          </div>
          <p className="mt-1 text-2xl font-black text-ink">{saved.authSessionExpiresHours}h</p>
        </GlassCard>
        <GlassCard padding="sm" className="rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            <TimerReset className="h-3.5 w-3.5" />
            Overstay
          </div>
          <p className="mt-1 text-2xl font-black text-ink">
            {saved.overstayAllowedDays === 0 ? "Same day" : `${saved.overstayAllowedDays}d`}
          </p>
        </GlassCard>
      </div>

      {error && (
        <GlassCard variant="bare" padding="sm" className="border-brand/25 bg-brand/10 text-sm font-semibold text-brand">
          {error}
        </GlassCard>
      )}
      {notice && !error && (
        <GlassCard variant="bare" padding="sm" className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </GlassCard>
      )}

      <GlassCard variant="strong" padding="lg">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Token auth expiry" hint="Hours before the next OTP login is required." required>
            <Input
              type="number"
              min={1}
              max={168}
              step={1}
              value={authSessionExpiresHours}
              onChange={(event) => setAuthSessionExpiresHours(event.target.value)}
            />
          </Field>
          <Field label="Overstay allowance" hint="0 means overstayed after the check-in day ends." required>
            <Input
              type="number"
              min={0}
              max={30}
              step={1}
              value={overstayAllowedDays}
              onChange={(event) => setOverstayAllowedDays(event.target.value)}
            />
          </Field>
          <Button className="w-full" disabled={busy}>
            <Save className="h-5 w-5" />
            {busy ? "Saving..." : "Save settings"}
          </Button>
        </form>
      </GlassCard>

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Changes apply to new login tokens and refreshed parking snapshots.
        </p>
      </GlassCard>
    </div>
  );
}
