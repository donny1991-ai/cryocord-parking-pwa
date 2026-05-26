"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { describeCameraError } from "@/lib/camera";

/** Thin wrapper around the QR scanner. Lazily loaded (camera + browser-only). */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (value: string) => void;
  onError?: (message: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl shadow-glass ring-1 ring-white/40">
      <Scanner
        onScan={(codes) => {
          const value = codes[0]?.rawValue;
          if (value) onResult(value);
        }}
        onError={(e) => onError?.(describeCameraError(e))}
        constraints={{ facingMode: "environment" }}
        components={{ finder: true }}
        styles={{ container: { borderRadius: "1.5rem" } }}
      />
    </div>
  );
}
