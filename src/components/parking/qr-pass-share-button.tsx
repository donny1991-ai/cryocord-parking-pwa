"use client";

import { useState } from "react";
import { Loader2, Send, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PASS_IMAGE_VERSION } from "@/lib/pass-image-version";
import { cn } from "@/lib/utils";
import type { VisitType } from "@/lib/enums";

interface QrPassShareButtonProps {
  token: string;
  plate: string;
  additionalPlates?: string[];
  visitorName: string;
  visitType: VisitType;
  validUntil: string;
  heading: string;
  message: string;
  whatsappHref?: string | null;
  buttonLabel?: string;
}

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

export function QrPassShareButton({
  token,
  plate,
  message,
  whatsappHref,
  buttonLabel = "Share QR image",
}: QrPassShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sharePassImage() {
    setBusy(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(`/api/public/pass-image?token=${encodeURIComponent(token)}&v=${PASS_IMAGE_VERSION}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to prepare the QR image.");
      const blob = await response.blob();
      const file = new File([blob], `cryocord-pass-${safeFilePart(plate)}.png`, { type: "image/png" });
      const nav = navigator as ShareNavigator;
      const shareData: ShareData = {
        title: "CryoCord Visitor Pass",
        text: message,
        files: [file],
      };

      if (typeof nav.share === "function" && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share(shareData);
        setNotice("QR image shared with pass details.");
        return;
      }

      downloadBlob(blob, file.name);
      setNotice(
        whatsappHref
          ? "QR image downloaded. Attach it in WhatsApp, then send the prepared message."
          : "QR image downloaded. Send this image to the visitor.",
      );
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to prepare the QR image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={sharePassImage} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        {busy ? "Preparing QR image..." : buttonLabel}
      </Button>

      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          <Send className="h-4 w-4" /> Open WhatsApp text
        </a>
      )}

      {notice && <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-700">{notice}</p>}
      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">{error}</p>}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "visitor";
}
