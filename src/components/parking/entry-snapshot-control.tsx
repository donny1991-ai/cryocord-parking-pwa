"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ImageUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { canCaptureEntrySnapshot, getEntrySnapshotUnavailableReason } from "@/lib/entry-snapshot";
import { checkCameraSupport, describeCameraError, getCameraStream, stopStream } from "@/lib/camera";
import { formatDateTime } from "@/lib/utils";
import type { Status } from "@/lib/enums";
import type { VisitEntrySnapshot } from "@/lib/types";

type CameraState = "idle" | "starting" | "live" | "blocked" | "uploading";
type SnapshotMode = "add" | "replace";

interface EntrySnapshotControlProps {
  visitId: string;
  status: Status;
  initialSnapshots?: VisitEntrySnapshot[];
}

export function EntrySnapshotControl({
  visitId,
  status,
  initialSnapshots = [],
}: EntrySnapshotControlProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [mode, setMode] = useState<SnapshotMode>("add");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const unavailableReason = getEntrySnapshotUnavailableReason(status);
  const eligible = canCaptureEntrySnapshot(status);
  const selectedSnapshot = snapshots[selectedIndex];
  const photoLoadFailed = Boolean(selectedSnapshot?.url && failedPhotoUrl === selectedSnapshot.url);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  function clampSelectedIndex(nextSnapshots: VisitEntrySnapshot[], preferredIndex = selectedIndex) {
    if (nextSnapshots.length === 0) return 0;
    return Math.min(Math.max(preferredIndex, 0), nextSnapshots.length - 1);
  }

  async function startCamera(nextMode: SnapshotMode) {
    setMode(nextMode);
    setNotice(null);
    setError(null);
    const support = checkCameraSupport();
    if (!support.ok) {
      if (support.reason !== "ssr") {
        setError(support.message);
        setCameraState("blocked");
      }
      return;
    }

    try {
      setCameraState("starting");
      const stream = await getCameraStream();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState("live");
    } catch (err) {
      setError(describeCameraError(err));
      setCameraState("blocked");
    }
  }

  async function uploadSnapshot(file: Blob, nextMode: SnapshotMode, snapshotId?: string) {
    setCameraState("uploading");
    setError(null);
    setNotice(null);

    const form = new FormData();
    form.append("snapshot", file, "entry-snapshot.jpg");
    const endpoint =
      nextMode === "replace" && snapshotId
        ? `/api/visitors/${encodeURIComponent(visitId)}/entry-snapshot/${encodeURIComponent(snapshotId)}`
        : `/api/visitors/${encodeURIComponent(visitId)}/entry-snapshot`;
    const response = await fetch(endpoint, {
      method: nextMode === "replace" && snapshotId ? "PUT" : "POST",
      body: form,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save entry snapshot.");
    }

    const saved = toVisitEntrySnapshot(payload.snapshot);
    if (!saved) {
      throw new Error("Entry snapshot saved, but the server response was incomplete.");
    }

    setFailedPhotoUrl(null);
    if (nextMode === "replace" && snapshotId) {
      setSnapshots((current) => current.map((snapshot) => (snapshot.id === snapshotId ? saved : snapshot)));
      setNotice("Entry snapshot replaced.");
    } else {
      setSnapshots((current) => [saved, ...current]);
      setSelectedIndex(0);
      setNotice("Entry snapshot saved to the visitor registration.");
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setCameraState("idle");
  }

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) {
      setError("Could not capture a still image. Try the upload button.");
      return;
    }

    try {
      await uploadSnapshot(blob, mode, mode === "replace" ? selectedSnapshot?.id : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save entry snapshot.");
      setCameraState("live");
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      await uploadSnapshot(file, mode, mode === "replace" ? selectedSnapshot?.id : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save entry snapshot.");
      setCameraState("idle");
    }
  }

  async function removeSelectedSnapshot() {
    if (!selectedSnapshot) return;
    setCameraState("uploading");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/visitors/${encodeURIComponent(visitId)}/entry-snapshot/${encodeURIComponent(selectedSnapshot.id)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove entry snapshot.");
      }

      setSnapshots((current) => {
        const next = current.filter((snapshot) => snapshot.id !== selectedSnapshot.id);
        setSelectedIndex(clampSelectedIndex(next, selectedIndex));
        return next;
      });
      setFailedPhotoUrl(null);
      setNotice("Entry snapshot removed from the registration and storage.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove entry snapshot.");
    } finally {
      setCameraState("idle");
    }
  }

  const preview = cameraState === "live" || cameraState === "starting" || cameraState === "uploading" ? (
    <>
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      {(cameraState === "starting" || cameraState === "uploading") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
        {cameraState === "uploading"
          ? "Working..."
          : cameraState === "starting"
            ? "Starting camera..."
            : mode === "replace"
              ? "Retake selected snapshot"
              : "New entry snapshot"}
      </div>
    </>
  ) : selectedSnapshot?.url && !photoLoadFailed ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs are short-lived.
    <img
      src={selectedSnapshot.url}
      alt="Visitor entry snapshot"
      className="h-full w-full object-cover"
      onError={() => setFailedPhotoUrl(selectedSnapshot.url ?? null)}
    />
  ) : selectedSnapshot?.url ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-faint">
      <ImageOff className="h-8 w-8 opacity-50" />
      <span className="text-xs">Snapshot is stored, but the preview link could not load.</span>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-faint">
      {eligible ? <Camera className="h-8 w-8 opacity-50" /> : <CameraOff className="h-8 w-8 opacity-50" />}
      <span className="text-xs">{eligible ? "No snapshot captured" : unavailableReason}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-faint">Entry snapshot</p>
          {selectedSnapshot && (
            <p className="mt-0.5 text-xs text-ink-faint">
              Captured {formatDateTime(selectedSnapshot.capturedAt)}
              {snapshots.length > 1 ? ` · ${selectedIndex + 1} of ${snapshots.length}` : ""}
            </p>
          )}
        </div>
        {snapshots.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Stored
          </span>
        )}
      </div>

      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-ink/5 text-ink-faint">
        {preview}
        {snapshots.length > 1 && cameraState === "idle" && (
          <>
            <button
              type="button"
              aria-label="Previous snapshot"
              className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
              onClick={() => setSelectedIndex((index) => clampSelectedIndex(snapshots, index - 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next snapshot"
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
              onClick={() => setSelectedIndex((index) => clampSelectedIndex(snapshots, index + 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">{error}</p>}
      {notice && <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}

      {eligible ? (
        <div className="space-y-2">
          {cameraState === "live" ? (
            <Button className="w-full" onClick={captureFrame}>
              <Camera className="h-4 w-4" />
              {mode === "replace" ? "Capture replacement" : "Capture snapshot"}
            </Button>
          ) : (
            <Button className="w-full" onClick={() => startCamera("add")} disabled={cameraState !== "idle"}>
              {cameraState === "starting" || cameraState === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {snapshots.length > 0 ? "Add snapshot" : "Open camera"}
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={selectedSnapshot && cameraState === "idle" ? "w-full px-3 text-sm" : "col-span-2 w-full"}
              disabled={cameraState === "uploading"}
              onClick={() => {
                setMode("add");
                inputRef.current?.click();
              }}
            >
              {cameraState === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              Use camera file
            </Button>
            {selectedSnapshot && cameraState === "idle" && (
              <>
                <Button type="button" variant="subtle" className="w-full px-3 text-sm" onClick={() => startCamera("replace")}>
                  <Camera className="h-4 w-4" />
                  Retake snapshot
                </Button>
                <Button type="button" variant="outline" className="col-span-2 w-full" onClick={removeSelectedSnapshot}>
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-white/60 bg-white/45 px-3 py-2 text-xs font-semibold text-ink-faint">
          {unavailableReason}
        </p>
      )}

      {cameraState === "blocked" && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => startCamera(mode)}>
          <RefreshCw className="h-4 w-4" />
          Retry camera
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={onFileSelected}
      />
    </div>
  );
}

function toVisitEntrySnapshot(value: unknown): VisitEntrySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const id = typeof snapshot.id === "string" ? snapshot.id : null;
  const capturedAt = typeof snapshot.entryPhotoCapturedAt === "string" ? snapshot.entryPhotoCapturedAt : null;
  if (!id || !capturedAt) return null;
  return {
    id,
    capturedAt,
    url: typeof snapshot.entryPhotoUrl === "string" ? snapshot.entryPhotoUrl : undefined,
  };
}
