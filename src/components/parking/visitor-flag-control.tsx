"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Flag, ShieldOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

export function VisitorFlagControl({
  visitId,
  initialReason,
  initialFlaggedAt,
  disabled,
}: {
  visitId: string;
  initialReason?: string;
  initialFlaggedAt?: string;
  disabled?: boolean;
}) {
  const [savedReason, setSavedReason] = useState(initialReason?.trim() ?? "");
  const [draftReason, setDraftReason] = useState(initialReason?.trim() ?? "");
  const [flaggedAt, setFlaggedAt] = useState<string | null>(initialFlaggedAt ?? null);
  const [editing, setEditing] = useState(!initialReason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const hasReviewFlag = Boolean(savedReason);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftReason.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/visitors/${visitId}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagReason: draftReason }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Registration could not be marked for review.");
      }
      const nextReason = payload.visitor.flagReason ?? draftReason;
      setSavedReason(nextReason);
      setDraftReason(nextReason);
      setFlaggedAt(payload.visitor.flaggedAt ?? new Date().toISOString());
      setEditing(false);
      router.refresh();
    } catch (flagError) {
      setError(flagError instanceof Error ? flagError.message : "Registration could not be marked for review.");
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
        throw new Error(payload.error ?? "Review flag could not be cleared.");
      }
      setSavedReason("");
      setDraftReason("");
      setFlaggedAt(null);
      setEditing(true);
      router.refresh();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Review flag could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard
      variant="strong"
      padding="lg"
      className={hasReviewFlag && !editing ? "space-y-4 border-brand/30 bg-brand/10" : "space-y-4"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Visit review flag</h2>
          </div>
          <p className="text-xs text-ink-faint">
            For active registrations that need guard attention before exit.
          </p>
        </div>
        {hasReviewFlag && !editing && (
          <Button type="button" variant="glass" size="sm" onClick={() => setEditing(true)} disabled={busy || disabled}>
            Update
          </Button>
        )}
      </div>

      {hasReviewFlag && !editing ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-brand/20 bg-white/70 px-3.5 py-3">
            <div className="flex items-center gap-2 text-brand">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-bold">Marked for guard review</p>
            </div>
            {flaggedAt && (
              <p className="mt-1 text-xs font-semibold text-ink-faint">
                Marked {formatDateTime(flaggedAt)}
              </p>
            )}
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-ink">{savedReason}</p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={clearFlag} disabled={busy || disabled}>
            <ShieldOff className="h-4 w-4" />
            {busy ? "Clearing..." : "Clear review flag"}
          </Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field
            label="Reason guards should see"
            hint="This appears on the visit and during exit confirmation."
            required
          >
            <Textarea
              value={draftReason}
              onChange={(event) => setDraftReason(event.target.value)}
              placeholder="Example: Verify with host before allowing exit."
              maxLength={2000}
              disabled={disabled}
            />
          </Field>
          <p className="rounded-2xl bg-white/55 px-3 py-2 text-xs font-semibold text-ink-faint">
            Review flags are only available while a registration is checked in. Checked-out registrations stay read-only.
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button disabled={!draftReason.trim() || busy || disabled}>
              <Flag className="h-4 w-4" />
              {busy ? "Saving..." : hasReviewFlag ? "Update reason" : "Mark for review"}
            </Button>
            {hasReviewFlag && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setDraftReason(savedReason);
                  setEditing(false);
                }}
                aria-label="Cancel"
                disabled={busy}
              >
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
