"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CameraOff, CheckCircle2, DoorOpen, ScanLine, Search, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill, Chip } from "@/components/ui/badge";
import { checkCameraSupport } from "@/lib/camera";
import { data } from "@/lib/data";
import { MOCK_NOW } from "@/lib/mock";
import type { Visit } from "@/lib/types";
import { durationSince, formatTime, normalisePlate } from "@/lib/utils";
import { visitTypeLabel } from "@/lib/labels";

// QR scanner is camera-only and browser-only — load it lazily, no SSR.
const QrScanner = dynamic(() => import("./qr-scanner").then((m) => m.QrScanner), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-3xl bg-ink/80" />,
});

export function ExitFlow() {
  const inside = data.insideVisits();
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [camMsg, setCamMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Visit | null>(null);
  const [exited, setExited] = useState(false);

  function startScan() {
    const support = checkCameraSupport();
    setCamMsg(support.ok ? null : support.message || "Camera unavailable.");
    setScanning(true);
  }

  const filtered = useMemo(() => {
    const q = normalisePlate(query);
    if (!q) return inside;
    return inside.filter(
      (v) => normalisePlate(v.plate).includes(q) || v.visitorName.toUpperCase().includes(query.toUpperCase()),
    );
  }, [query, inside]);

  function resolveToken(token: string) {
    // Production: verifyVisitToken(token) → visitId. Demo: parse trailing id.
    const id = token.split(/[:.]/).pop() ?? "";
    const v = data.getVisit(id);
    setScanning(false);
    if (v) setSelected(v);
    else alert("Pass not recognised. Search by plate instead.");
  }

  if (exited && selected) {
    return (
      <div className="space-y-5 text-center">
        <div className="flex flex-col items-center gap-1 animate-fade-up">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h2 className="text-xl font-bold text-ink">Exit logged</h2>
          <p className="text-sm text-ink-faint">{selected.plate} has left the car park.</p>
        </div>
        <GlassCard padding="lg" className="mx-auto max-w-sm space-y-1 text-left">
          <Row label="Plate" value={selected.plate} />
          <Row label="Visitor" value={selected.visitorName} />
          <Row label="Duration on site" value={durationSince(selected.entryTime, MOCK_NOW)} />
          <Row label="Exit time" value={formatTime(MOCK_NOW)} />
        </GlassCard>
        <Link href="/parking">
          <Button variant="glass" className="mx-auto w-full max-w-sm">Done</Button>
        </Link>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <GlassCard variant="strong" padding="lg" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Confirm exit</p>
            <StatusPill status={selected.status} />
          </div>
          <p className="text-3xl font-bold tracking-wide text-ink">{selected.plate}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="brand">{visitTypeLabel(selected.visitType)}</Chip>
            <Chip>On site {durationSince(selected.entryTime, MOCK_NOW)}</Chip>
          </div>
          <p className="text-sm text-ink-soft">{selected.visitorName} · {selected.visitorContact}</p>
        </GlassCard>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="glass" onClick={() => setSelected(null)}>Cancel</Button>
          <Button onClick={() => setExited(true)}>
            <DoorOpen className="h-5 w-5" /> Confirm exit
          </Button>
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
              <p className="text-xs text-ink-faint">…or search the plate below.</p>
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
          <ScanLine className="h-6 w-6" /> Scan visitor pass
        </Button>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="…or search plate / name"
          className="pl-10"
        />
      </div>

      <div className="space-y-2.5">
        <p className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint">
          On site ({filtered.length})
        </p>
        {filtered.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelected(v)}
            className="glass glass-interactive flex w-full items-center justify-between rounded-2xl p-3.5 text-left"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink">{v.plate}</span>
                <StatusPill status={v.status} />
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">
                {v.visitorName} · {visitTypeLabel(v.visitType)}
              </p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-ink-soft">
              {durationSince(v.entryTime, MOCK_NOW)}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-faint">No matching vehicle on site.</p>
        )}
      </div>
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
