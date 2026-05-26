/**
 * Camera access helpers shared by plate capture (entry) and QR scanning (exit).
 *
 * The #1 reason a guard's camera "doesn't work" is a non-secure context:
 * getUserMedia is only exposed over HTTPS or on localhost. Opening the PWA on a
 * phone via http://<lan-ip>:3000 silently disables the camera. Run the dev
 * server with `npm run dev:https` and open the https:// address on the device.
 */

export type CameraSupport =
  | { ok: true }
  | { ok: false; reason: "ssr" | "insecure" | "unsupported"; message: string };

export function checkCameraSupport(): CameraSupport {
  if (typeof window === "undefined") {
    return { ok: false, reason: "ssr", message: "" };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: "insecure",
      message:
        "The camera needs a secure connection. On a phone, open the https:// address (run “npm run dev:https” on the server).",
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "unsupported",
      message: "This browser does not expose camera access.",
    };
  }
  return { ok: true };
}

/** Open a rear-facing stream, falling back to any camera (desktops / single-cam). */
export async function getCameraStream(): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  try {
    return await md.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 16 / 9 },
      },
      audio: false,
    });
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "OverconstrainedError" || err.name === "NotFoundError")
    ) {
      return md.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

/** Turn a getUserMedia rejection into a guard-readable, actionable message. */
export function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera permission was blocked. Allow camera access for this site, then retry.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No camera was found on this device.";
      case "NotReadableError":
        return "The camera is in use by another app. Close it and retry.";
      case "AbortError":
        return "The camera did not start. Retry.";
    }
  }
  return "Could not start the camera. Enter the plate manually or retry.";
}

/** Stop all tracks on a stream (cleanup on unmount / mode switch). */
export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
