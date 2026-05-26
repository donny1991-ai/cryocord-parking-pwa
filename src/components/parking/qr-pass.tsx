"use client";

import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Chip } from "@/components/ui/badge";
import { visitTypeLabel } from "@/lib/labels";
import type { VisitType } from "@/lib/enums";

/**
 * Visitor pass. The QR encodes an OPAQUE signed token (visit_id reference only),
 * never the plate or any PII — details are resolved server-side on the next scan.
 */
export function QrPass({
  token,
  plate,
  visitorName,
  visitType,
  validUntil,
}: {
  token: string;
  plate: string;
  visitorName: string;
  visitType: VisitType;
  validUntil: string;
}) {
  return (
    <GlassCard variant="strong" padding="lg" className="mx-auto max-w-sm text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">CryoCord Visitor Pass</p>
      <h2 className="mt-1 text-lg font-bold text-ink">Show this to the visitor</h2>

      <div className="mx-auto mt-4 w-fit rounded-3xl bg-white p-5 shadow-lift ring-1 ring-black/5">
        <QRCodeSVG
          value={token}
          size={208}
          level="M"
          fgColor="#1A1A1A"
          bgColor="#FFFFFF"
          marginSize={0}
        />
      </div>

      <div className="mt-4 space-y-1">
        <p className="text-2xl font-bold tracking-wide text-ink">{plate}</p>
        <p className="text-sm text-ink-soft">{visitorName}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Chip tone="brand">{visitTypeLabel(visitType)}</Chip>
          <Chip>Valid until {validUntil}</Chip>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck className="h-3.5 w-3.5" />
        Opaque pass code — no personal data is stored in this QR.
      </p>
    </GlassCard>
  );
}
