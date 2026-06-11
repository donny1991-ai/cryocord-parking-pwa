"use client";

import { useRef, type Ref } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export function WallRegistrationQr({ configuredUrl }: { configuredUrl?: string }) {
  const posterImageRef = useRef<HTMLImageElement | null>(null);
  const fallbackOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const registrationUrl = configuredUrl || (fallbackOrigin ? `${fallbackOrigin}/register` : "/register");

  async function printPoster() {
    await waitForPosterImage(posterImageRef.current);
    window.print();
  }

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="mx-auto w-full max-w-[220px] sm:mx-0 sm:max-w-[180px]">
          <WallRegistrationPoster registrationUrl={registrationUrl} imageRef={posterImageRef} />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Wall QR</p>
          <h2 className="mt-1 text-xl font-bold text-ink">Visitor self-registration</h2>
          <p className="mt-2 break-all rounded-2xl bg-white/45 px-3 py-2 text-xs font-semibold text-ink-soft">
            {registrationUrl}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" size="sm" onClick={printPoster}>
              <Printer className="h-4 w-4" />
              Print poster
            </Button>
            <a
              href={registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-white/50 px-3.5 text-sm font-bold text-brand backdrop-blur-md transition-colors hover:bg-brand-tint hover:border-brand/50"
            >
              <ExternalLink className="h-4 w-4" />
              Open form
            </a>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function WallRegistrationPoster({
  registrationUrl,
  imageRef,
}: {
  registrationUrl: string;
  imageRef?: Ref<HTMLImageElement>;
}) {
  return (
    <div
      className="wall-qr-template-poster wall-qr-template-poster-preview wall-qr-template-poster-print"
      data-testid="wall-qr-template-preview"
    >
      {/* Plain img is used so Chrome print preview keeps the template visible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src="/parking/wall-registration-template.png"
        alt=""
        loading="eager"
        decoding="sync"
        className="wall-qr-template-image"
      />
      <div className="wall-qr-template-code">
        <QRCodeSVG
          value={registrationUrl}
          size={1024}
          level="M"
          fgColor="#000000"
          bgColor="#FFFFFF"
          marginSize={1}
        />
      </div>
    </div>
  );
}

async function waitForPosterImage(image: HTMLImageElement | null) {
  if (!image) return;

  if (!image.complete) {
    await new Promise<void>((resolve) => {
      let timeout: number | undefined;
      const done = () => {
        if (timeout) window.clearTimeout(timeout);
        image.removeEventListener("load", done);
        image.removeEventListener("error", done);
        resolve();
      };
      image.addEventListener("load", done);
      image.addEventListener("error", done);
      timeout = window.setTimeout(done, 2000);
    });
  }

  await image.decode?.().catch(() => undefined);
}
