"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Keyboard, Loader2, RefreshCw } from "lucide-react";
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

type Status = "starting" | "live" | "reading" | "detected" | "blocked";
type Feedback = { tone: "success" | "warning" | "error"; message: string } | null;

const PLATE_FRAME = {
  x: 0.08,
  y: 0.32,
  width: 0.84,
  height: 0.34,
};
const AUTO_ADVANCE_CONFIDENCE = 0.75;

function preparePlateImage(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const cropX = Math.round(sourceWidth * PLATE_FRAME.x);
  const cropY = Math.round(sourceHeight * PLATE_FRAME.y);
  const cropWidth = Math.round(sourceWidth * PLATE_FRAME.width);
  const cropHeight = Math.round(sourceHeight * PLATE_FRAME.height);
  const scale = 2;

  canvas.width = cropWidth * scale;
  canvas.height = cropHeight * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;

  context.imageSmoothingEnabled = true;
  context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const contrasted = Math.max(0, Math.min(255, (luminance - 128) * 1.8 + 128));
    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);

  return canvas;
}

/**
 * Plate capture: live camera + on-device OCR (lib/ocr → Tesseract.js, ADR D3),
 * with a manual-entry fallback that is always one tap away. No image leaves the
 * device. When the camera can't start, the real reason is shown (insecure
 * context / permission / no device) rather than a silent fallback.
 */
export function PlateCapture({ onPlate }: { onPlate: (plate: string, source: "scan" | "manual") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
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

    start();
    return () => {
      cancelled = true;
      if (advanceTimerRef.current) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [attempt]);

  async function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setStatus("reading");
    setFeedback(null);
    try {
      const candidates = await recognisePlate(preparePlateImage(video, canvas));
      if (candidates.length > 0) {
        const bestCandidate = candidates[0];
        const detectedPlate = normalisePlate(bestCandidate.plate);
        setManual(detectedPlate);
        if (bestCandidate.confidence >= AUTO_ADVANCE_CONFIDENCE) {
          setFeedback({ tone: "success", message: `${detectedPlate} scanned successfully. Opening details…` });
          setStatus("detected");
          advanceTimerRef.current = window.setTimeout(() => {
            onPlate(detectedPlate, "scan");
          }, 650);
        } else {
          setFeedback({ tone: "warning", message: `${detectedPlate} was detected with low confidence. Check it, edit if needed, then tap Use.` });
          setStatus("live");
        }
      } else {
        setFeedback({ tone: "error", message: "Couldn't read a plate. Reframe and capture again, or type it below." });
        setStatus("live");
      }
    } catch {
      setFeedback({ tone: "error", message: "On-device OCR is unavailable here. Type the plate below." });
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
              <div className="h-[34%] w-[84%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {status === "reading"
                ? "Reading plate…"
                : status === "detected"
                  ? "Plate detected"
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

      {feedback && (
        <div
          role={feedback.tone === "success" ? "status" : "alert"}
          className={
            feedback.tone === "success"
              ? "flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-center text-xs font-bold text-emerald-700"
              : feedback.tone === "warning"
                ? "flex items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-center text-xs font-bold text-amber-800"
              : "rounded-2xl border border-brand/20 bg-brand/10 px-3.5 py-2.5 text-center text-xs font-bold text-brand"
          }
        >
          {feedback.tone === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {feedback.tone === "warning" && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

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
      {status === "detected" && (
        <Button size="lg" className="w-full bg-emerald-600 shadow-[0_12px_34px_rgba(5,150,105,0.28)]" disabled>
          <CheckCircle2 className="h-5 w-5" />
          Plate scanned
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
          disabled={status === "detected" || normalisePlate(manual).length < 3}
          onClick={() => onPlate(normalisePlate(manual), "manual")}
        >
          <Keyboard className="h-5 w-5" />
          Use
        </Button>
      </div>
    </div>
  );
}
