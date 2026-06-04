"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CameraOff, CheckCircle2, LogIn, ScanLine, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/badge";
import { checkCameraSupport } from "@/lib/camera";
import { visitTypeLabel } from "@/lib/labels";

const QrScanner = dynamic(() => import("./qr-scanner").then((module) => module.QrScanner), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-3xl bg-ink/80" />,
});

interface ScannedVisitor {
  id: string;
  name: string;
  phoneNumber: string;
  vehicleNumber: string;
  typeCode: "guest" | "vendor" | "client" | "staff";
  purpose: string;
  checkedIn: string | null;
  status: string;
}

export function ArrivalScanFlow() {
  const [scanning, setScanning] = useState(false);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<ScannedVisitor | null>(null);

  function startScan() {
    const support = checkCameraSupport();
    setCamMsg(support.ok ? null : support.message || "Camera unavailable.");
    setScanError(null);
    setScanning(true);
  }

  async function resolveToken(token: string) {
    setScanError(null);
    try {
      const response = await fetch("/api/visitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "check_in" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to check in this pass.");
      }

      setCheckedIn(payload.visitor);
      setScanning(false);
    } catch (error) {
      setScanning(false);
      setScanError(error instanceof Error ? error.message : "Unable to check in this pass.");
    }
  }

  if (checkedIn) {
    return (
      <div className="space-y-5 text-center">
        <div className="flex flex-col items-center gap-1 animate-fade-up">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Arrival checked in</h2>
          <p className="text-sm text-ink-faint">{checkedIn.vehicleNumber} is now on site.</p>
        </div>

        <GlassCard padding="lg" className="mx-auto max-w-sm space-y-3 text-left">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Plate</p>
            <p className="text-3xl font-bold tracking-wide text-ink">{checkedIn.vehicleNumber}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700">Inside</Chip>
            <Chip tone="brand">{visitTypeLabel(checkedIn.typeCode)}</Chip>
          </div>
          <Row label="Visitor" value={checkedIn.name} />
          <Row label="Contact" value={checkedIn.phoneNumber} />
        </GlassCard>

        <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          <Button variant="glass" onClick={() => setCheckedIn(null)}>Scan next</Button>
          <Link href="/parking">
            <Button className="w-full">Done</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scanning ? (
        <div className="space-y-3">
          {camMsg ? (
            <GlassCard padding="lg" className="flex flex-col items-center gap-3 text-center">
              <CameraOff className="h-9 w-9 text-ink-faint" />
              <p className="text-sm text-ink-soft">{camMsg}</p>
              <Button variant="outline" size="sm" onClick={startScan}>Retry camera</Button>
            </GlassCard>
          ) : (
            <QrScanner onResult={resolveToken} onError={setCamMsg} />
          )}
          <Button variant="glass" className="w-full" onClick={() => { setScanning(false); setCamMsg(null); }}>
            <X className="h-4 w-4" /> Cancel scan
          </Button>
        </div>
      ) : (
        <Button size="xl" className="w-full" onClick={startScan}>
          <ScanLine className="h-6 w-6" /> Scan arrival QR
        </Button>
      )}

      {scanError && (
        <p className="rounded-2xl bg-brand/10 px-3 py-2 text-center text-xs font-semibold text-brand">
          {scanError}
        </p>
      )}

      <GlassCard variant="bare" padding="sm" className="flex items-start gap-2.5">
        <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Arrival scan accepts pre-registered QR passes only for check-in. Use Log Exit when the vehicle leaves.
        </p>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/50 py-1.5 last:border-0">
      <span className="text-sm text-ink-faint">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
