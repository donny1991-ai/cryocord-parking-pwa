"use client";

import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Visitor-facing pass. Reached from the WhatsApp link. Renders the same
 * scannable QR (the opaque token) so the visitor can save/screenshot it.
 */
export function PassView({ token }: { token: string }) {
  return (
    <GlassCard variant="strong" padding="lg" className="w-full max-w-sm text-center">
      <Logo size={26} className="justify-center" />
      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand">Visitor Pass</p>
      <h1 className="mt-1 text-lg font-bold text-ink">Your CryoCord gate pass</h1>

      <div className="mx-auto mt-4 w-fit rounded-3xl bg-white p-5 shadow-lift ring-1 ring-black/5">
        <QRCodeSVG value={token} size={208} level="M" fgColor="#1A1A1A" bgColor="#FFFFFF" marginSize={0} />
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Save or screenshot this code and show it to the guard when you arrive.
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck className="h-3.5 w-3.5" />
        Opaque pass code — no personal data is stored in this QR.
      </p>
    </GlassCard>
  );
}
