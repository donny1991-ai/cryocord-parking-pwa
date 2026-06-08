"use client";

import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

type IdentityType = "nric" | "passport";

function maskIdentityDocument(type: IdentityType, value: string) {
  if (type === "nric") {
    const digits = value.replace(/\D/g, "");
    return `******-**-${digits.slice(-4)}`;
  }

  return value.length > 4 ? `****${value.slice(-4)}` : value;
}

export function IdentityDocumentRow({
  identityType,
  nric,
  passportNumber,
}: {
  identityType?: IdentityType;
  nric?: string;
  passportNumber?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const type = identityType === "passport" && passportNumber ? "passport" : "nric";
  const value = type === "passport" ? passportNumber : nric;
  if (!value) return null;

  const label = type === "passport" ? "Passport" : "NRIC";
  const displayValue = revealed ? value : maskIdentityDocument(type, value);

  return (
    <div className="flex items-start gap-3 border-b border-white/50 pb-3 last:border-0 last:pb-0">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-faint">Identity</p>
        <p className="break-all text-sm font-semibold text-ink">
          <span className="mr-1">{label}</span>
          <span>{displayValue}</span>
        </p>
      </div>
      <button
        type="button"
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition hover:bg-white/70 hover:text-brand"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
