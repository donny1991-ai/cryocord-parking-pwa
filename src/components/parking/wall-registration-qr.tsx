"use client";

import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Printer } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export function WallRegistrationQr({ configuredUrl }: { configuredUrl?: string }) {
  const fallbackOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const registrationUrl = configuredUrl || (fallbackOrigin ? `${fallbackOrigin}/register` : "/register");

  return (
    <>
      <GlassCard padding="lg" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow-lift ring-1 ring-black/5 sm:mx-0">
            <QRCodeSVG
              value={registrationUrl}
              size={156}
              level="M"
              fgColor="#1A1A1A"
              bgColor="#FFFFFF"
              marginSize={1}
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Wall QR</p>
            <h2 className="mt-1 text-xl font-bold text-ink">Visitor self-registration</h2>
            <p className="mt-2 break-all rounded-2xl bg-white/45 px-3 py-2 text-xs font-semibold text-ink-soft">
              {registrationUrl}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print poster
              </Button>
              <a
                href={registrationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-white/50 px-3.5 text-sm font-bold text-brand backdrop-blur-md transition-colors hover:bg-brand-tint hover:border-brand/50"
              >
                <ExternalLink className="h-4 w-4" />
                Open form
              </a>
            </div>
          </div>
        </div>
      </GlassCard>

      <section className="wall-qr-print-sheet" aria-hidden="true">
        <div className="wall-qr-print-poster">
          <header className="wall-qr-print-header">
            <Logo showWordmark showTagline size={42} />
            <span>Visitor Registration</span>
          </header>

          <div className="wall-qr-print-body">
            <p className="wall-qr-print-eyebrow">Scan before entering</p>
            <h1>Welcome to CryoCord</h1>
            <p className="wall-qr-print-copy">
              Please scan this QR code and complete your visitor registration. Security will verify your details and host before entry.
            </p>

            <div className="wall-qr-print-code">
              <QRCodeSVG
                value={registrationUrl}
                size={330}
                level="M"
                fgColor="#1A1A1A"
                bgColor="#FFFFFF"
                marginSize={1}
              />
            </div>

            <p className="wall-qr-print-url">{registrationUrl}</p>
          </div>

          <footer className="wall-qr-print-footer">
            Premises security and access control - Data processed according to CryoCord visitor policy
          </footer>
        </div>
      </section>
    </>
  );
}
