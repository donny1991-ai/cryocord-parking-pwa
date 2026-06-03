"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function VisitorCancelControl({ visitId }: { visitId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function cancelVisit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/visitors/${visitId}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Visitor pass could not be cancelled.");
      }
      setConfirmOpen(false);
      router.refresh();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Visitor pass could not be cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-ink-faint/30 text-ink-soft hover:border-brand/40 hover:text-brand"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
      >
        <Ban className="h-4 w-4" />
        {busy ? "Cancelling..." : "Cancel pending visit"}
      </Button>
      {error && <p className="text-center text-xs font-semibold text-brand">{error}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title="Cancel pending visit?"
        description="This visitor has not checked in yet. Cancelling will disable the shared QR pass link."
        confirmLabel="Cancel visit"
        cancelLabel="Keep visit"
        busyLabel="Cancelling..."
        busy={busy}
        onConfirm={cancelVisit}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}
