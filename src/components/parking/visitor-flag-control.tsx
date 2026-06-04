"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ShieldOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Input } from "@/components/ui/input";

export function VisitorFlagControl({
  visitId,
  initialReason,
  disabled,
}: {
  visitId: string;
  initialReason?: string;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState(initialReason ?? "");
  const [editing, setEditing] = useState(!initialReason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/visitors/${visitId}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagReason: reason }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Visitor could not be flagged.");
      }
      setReason(payload.visitor.flagReason ?? reason);
      setEditing(false);
      router.refresh();
    } catch (flagError) {
      setError(flagError instanceof Error ? flagError.message : "Visitor could not be flagged.");
    } finally {
      setBusy(false);
    }
  }

  async function clearFlag() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/visitors/${visitId}/flag`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Flag could not be cleared.");
      }
      setReason("");
      setEditing(true);
      router.refresh();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Flag could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard
      variant="strong"
      padding="lg"
      className={reason && !editing ? "space-y-3 border-brand/30 bg-brand/10" : "space-y-3"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Visitor flag</h2>
        </div>
        {reason && !editing && (
          <Button type="button" variant="glass" size="sm" onClick={() => setEditing(true)} disabled={busy || disabled}>
            Edit
          </Button>
        )}
      </div>

      {reason && !editing ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-white/65 px-3.5 py-3 text-sm font-semibold text-ink">{reason}</p>
          <Button type="button" variant="outline" className="w-full" onClick={clearFlag} disabled={busy || disabled}>
            <ShieldOff className="h-4 w-4" />
            {busy ? "Clearing..." : "Clear flag"}
          </Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Flag reason" required>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for escalation"
              maxLength={2000}
              disabled={disabled}
            />
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button disabled={!reason.trim() || busy || disabled}>
              <Flag className="h-4 w-4" />
              {busy ? "Saving..." : "Save flag"}
            </Button>
            {initialReason && (
              <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </form>
      )}

      {error && <p className="text-xs font-semibold text-brand">{error}</p>}
    </GlassCard>
  );
}
