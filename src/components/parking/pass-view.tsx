"use client";

import { QRCodeSVG } from "qrcode.react";
import { CircleAlert, Download, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GlassCard } from "@/components/ui/glass-card";
import { PASS_IMAGE_VERSION } from "@/lib/pass-image-version";
import type { PublicVisitorPass } from "@/lib/server/visitors";
import { formatDate, formatDateTime } from "@/lib/utils";

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

  const validUntil = formatDateTime(pass.validUntil);
  const visitDate = formatDate(pass.visitDate ?? pass.validUntil);
  const details = [
    `Vehicle: ${pass.plate}`,
    ...(pass.additionalPlates.length > 0 ? [`Linked: ${pass.additionalPlates.join(", ")}`] : []),
    `Visitor: ${pass.visitorName}`,
    `Type: ${pass.visitTypeLabel}`,
    `Visit date: ${visitDate}`,
    `Valid until: ${validUntil}`,
  ];
  const imageUrl = `/api/public/pass-image?token=${encodeURIComponent(pass.token)}&v=${PASS_IMAGE_VERSION}`;

  return (
    <section className="w-full max-w-[360px] text-center">
      <div className="visitor-pass-template-poster visitor-pass-template-poster-preview" data-testid="public-pass-template">
        {/* Plain img keeps the template reliable when users save or print the page. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/parking/visitor-pass-template.png"
          alt=""
          loading="eager"
          decoding="sync"
          className="visitor-pass-template-image"
        />
        <div className="visitor-pass-template-code">
          <QRCodeSVG value={pass.token} size={1024} level="M" fgColor="#000000" bgColor="#FFFFFF" marginSize={1} />
        </div>
        <div className="visitor-pass-template-details" aria-label={pass.heading}>
          {details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
      </div>

      <GlassCard variant="strong" padding="sm" className="mt-3 space-y-2">
        <p className="text-sm font-semibold text-ink-soft">{pass.message}</p>
        <a
          href={imageUrl}
          download
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-white/55 px-3.5 text-sm font-bold text-brand backdrop-blur-md transition-colors hover:border-brand/50 hover:bg-brand-tint"
        >
          <Download className="h-4 w-4" />
          Save pass image
        </a>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          Opaque pass code — no personal data is stored in this QR.
        </p>
      </GlassCard>
    </section>
  );
}
