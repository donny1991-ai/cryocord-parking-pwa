"use client";

import { QRCodeSVG } from "qrcode.react";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GlassCard } from "@/components/ui/glass-card";
import type { PublicVisitorPass } from "@/lib/server/visitors";
import { formatDateTime } from "@/lib/utils";

/**
 * Visitor-facing pass. Reached from the WhatsApp link. Renders the same
 * scannable QR (the opaque token) so the visitor can save/screenshot it.
 */
export function PassView({ pass }: { pass: PublicVisitorPass }) {
  if (pass.state === "inactive") {
    return (
      <GlassCard variant="strong" padding="lg" className="w-full max-w-sm text-center">
        <Logo size={26} className="justify-center" />
        <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand/10">
          <CircleAlert className="h-8 w-8 text-brand" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-brand">Visitor Pass</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{pass.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{pass.message}</p>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          QR code hidden after expiry or checkout.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="strong" padding="lg" className="w-full max-w-sm text-center">
      <Logo size={26} className="justify-center" />
      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand">Visitor Pass</p>
      <h1 className="mt-1 text-lg font-bold text-ink">{pass.heading}</h1>

      <div className="mx-auto mt-4 w-fit rounded-3xl bg-white p-5 shadow-lift ring-1 ring-black/5">
        <QRCodeSVG value={pass.token} size={208} level="M" fgColor="#1A1A1A" bgColor="#FFFFFF" marginSize={0} />
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        {pass.message}
      </p>
      {pass.validUntil && (
        <p className="mt-2 text-xs font-semibold text-ink-soft">Valid until {formatDateTime(pass.validUntil)}</p>
      )}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck className="h-3.5 w-3.5" />
        Opaque pass code — no personal data is stored in this QR.
      </p>
    </GlassCard>
  );
}
