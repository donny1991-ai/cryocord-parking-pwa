"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalisePlate } from "@/lib/utils";
import { recognisePlate } from "@/lib/ocr";
import {
  checkCameraSupport,
  describeCameraError,
  getCameraStream,
  stopStream,
} from "@/lib/camera";

type Status = "starting" | "live" | "reading" | "blocked";

/**
 * Plate capture: live camera + on-device OCR (lib/ocr → Tesseract.js, ADR D3),
 * with a manual-entry fallback that is always one tap away. No image leaves the
 * device. When the camera can't start, the real reason is shown (insecure
 * context / permission / no device) rather than a silent fallback.
 */
export function PlateCapture({ onPlate }: { onPlate: (plate: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const support = checkCameraSupport();
      if (!support.ok) {
        if (support.reason !== "ssr") {
          setError(support.message);
          setStatus("blocked");
        }
        return;
      }
      try {
        const stream = await getCameraStream();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setError(null);
        setStatus("live");
      } catch (err) {
        if (!cancelled) {
          setError(describeCameraError(err));
          setStatus("blocked");
        }
      }
    }

    setStatus("starting");
    start();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [attempt]);

  async function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setStatus("reading");
    setNotice(null);
    try {
      const candidates = await recognisePlate(canvas);
      if (candidates.length > 0) {
        onPlate(candidates[0].plate);
      } else {
        setNotice("Couldn't read a plate. Reframe and capture again, or type it below.");
        setStatus("live");
      }
    } catch {
      setNotice("On-device OCR is unavailable here. Type the plate below.");
      setStatus("live");
    }
  }

  const retry = () => {
    setError(null);
    setStatus("starting");
    setAttempt((a) => a + 1);
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-ink shadow-glass">
        {status === "blocked" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white/85">
            <CameraOff className="h-10 w-10 opacity-60" />
            <p className="text-sm leading-relaxed">{error ?? "Camera unavailable."}</p>
            <button
              onClick={retry}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold backdrop-blur hover:bg-white/25"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry camera
            </button>
            <p className="text-[11px] text-white/55">…or just type the plate below.</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[28%] w-[78%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {status === "reading"
                ? "Reading plate…"
                : status === "starting"
                  ? "Starting camera…"
                  : "Frame the number plate"}
            </div>
            {(status === "reading" || status === "starting") && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {notice && <p className="px-1 text-center text-xs font-medium text-brand">{notice}</p>}

      {status === "live" && (
        <Button size="lg" className="w-full" onClick={capture}>
          <Camera className="h-5 w-5" />
          Capture &amp; read plate
        </Button>
      )}
      {status === "reading" && (
        <Button size="lg" className="w-full" disabled>
          <Loader2 className="h-5 w-5 animate-spin" />
          Reading…
        </Button>
      )}

      {/* Manual entry — always available */}
      <div className="flex items-center gap-2">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value.toUpperCase())}
          placeholder="e.g. WA 18 K"
          inputMode="text"
          autoCapitalize="characters"
          className="font-bold tracking-wide"
        />
        <Button
          variant="outline"
          size="lg"
          disabled={normalisePlate(manual).length < 3}
          onClick={() => onPlate(normalisePlate(manual))}
        >
          <Keyboard className="h-5 w-5" />
          Use
        </Button>
      </div>
    </div>
  );
}
