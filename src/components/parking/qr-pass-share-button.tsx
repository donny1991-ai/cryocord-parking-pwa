"use client";

import { useRef, useState } from "react";
import { Loader2, Send, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button, buttonVariants } from "@/components/ui/button";
import { visitTypeLabel } from "@/lib/labels";
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
}

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

export function QrPassShareButton({
  token,
  plate,
  additionalPlates = [],
  visitorName,
  visitType,
  validUntil,
  heading,
  message,
  whatsappHref,
}: QrPassShareButtonProps) {
  const qrRef = useRef<SVGSVGElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sharePassImage() {
    if (!qrRef.current) return;
    setBusy(true);
    setNotice(null);
    setError(null);

    try {
      const blob = await renderPassPng({
        qrSvg: qrRef.current,
        plate,
        additionalPlates,
        visitorName,
        visitType,
        validUntil,
        heading,
      });
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
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <QRCodeSVG
          ref={qrRef}
          value={token}
          size={360}
          level="M"
          fgColor="#1A1A1A"
          bgColor="#FFFFFF"
          marginSize={0}
        />
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={sharePassImage} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        {busy ? "Preparing QR image..." : "Share QR image"}
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

async function renderPassPng({
  qrSvg,
  plate,
  additionalPlates,
  visitorName,
  visitType,
  validUntil,
  heading,
}: {
  qrSvg: SVGSVGElement;
  plate: string;
  additionalPlates: string[];
  visitorName: string;
  visitType: VisitType;
  validUntil: string;
  heading: string;
}) {
  const qrImage = await svgToImage(qrSvg);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not create the pass image.");

  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRoundedRect(ctx, 90, 80, 900, 1340, 66, "#FFFFFF", {
    color: "rgba(15, 23, 42, 0.18)",
    blur: 48,
    offsetY: 24,
  });

  drawBrandMark(ctx, 540, 170);

  ctx.textAlign = "center";
  ctx.fillStyle = "#D40B2E";
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText("VISITOR PASS", 540, 270);

  ctx.fillStyle = "#111827";
  ctx.font = "700 48px Arial, sans-serif";
  wrapCenteredText(ctx, heading, 540, 342, 760, 56, 2);

  drawRoundedRect(ctx, 266, 430, 548, 548, 52, "#FFFFFF", {
    color: "rgba(15, 23, 42, 0.12)",
    blur: 26,
    offsetY: 12,
  });
  ctx.drawImage(qrImage, 326, 490, 428, 428);

  ctx.fillStyle = "#111827";
  ctx.font = "700 58px Arial, sans-serif";
  ctx.fillText(plate, 540, 1078);

  ctx.fillStyle = "#4B5563";
  ctx.font = "500 34px Arial, sans-serif";
  wrapCenteredText(ctx, visitorName, 540, 1132, 740, 40, 2);

  let infoY = 1204;
  infoY = drawPill(ctx, visitTypeLabel(visitType), 540, infoY, "#FFF1F3", "#D40B2E");
  infoY += 38;
  infoY = drawPill(ctx, `Valid until ${validUntil}`, 540, infoY, "#F6F7F9", "#374151");

  if (additionalPlates.length > 0) {
    ctx.fillStyle = "#6B7280";
    ctx.font = "600 28px Arial, sans-serif";
    wrapCenteredText(ctx, `Also covers ${additionalPlates.join(", ")}`, 540, infoY + 52, 760, 34, 2);
  }

  ctx.fillStyle = "#7A7A7A";
  ctx.font = "500 24px Arial, sans-serif";
  ctx.fillText("Opaque QR code. Card details are for guard verification.", 540, 1352);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Unable to create the QR image.");
  return blob;
}

async function svgToImage(svg: SVGSVGElement) {
  const source = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to render the QR code image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
  shadow?: { color: string; blur: number; offsetY: number },
) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#D40B2E";
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0.15 * Math.PI, 1.75 * Math.PI);
  ctx.arc(15, -5, 18, 1.75 * Math.PI, 0.15 * Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(8, -8, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  lines.forEach((item, index) => {
    ctx.fillText(item, x, y + index * lineHeight);
  });
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  background: string,
  color: string,
) {
  ctx.font = "700 27px Arial, sans-serif";
  const width = Math.min(760, ctx.measureText(text).width + 54);
  drawRoundedRect(ctx, centerX - width / 2, y - 34, width, 58, 29, background);
  ctx.fillStyle = color;
  ctx.fillText(text, centerX, y + 4);
  return y + 58;
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
