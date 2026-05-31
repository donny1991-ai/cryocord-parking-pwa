"use client";

import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";

type Step = "email" | "otp";

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to request login code.");
      }
      setMessage(payload.message ?? "If this email has parking access, a login code has been sent.");
      setStep("otp");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request login code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Invalid or expired login code.");
      }
      window.location.assign("/parking");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid or expired login code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard padding="lg" className="space-y-4">
      <Field label="Email" required>
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@cryocord.com.my"
          type="email"
          autoComplete="email"
          disabled={loading || step === "otp"}
        />
      </Field>

      {step === "otp" && (
        <Field label="6-digit code" required>
          <Input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="text-center text-2xl font-bold tracking-[0.4em]"
            disabled={loading}
          />
        </Field>
      )}

      {message && <p className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">{error}</p>}

      {step === "email" ? (
        <Button className="w-full" size="xl" onClick={requestOtp} disabled={loading || !email.trim()}>
          <Mail className="h-5 w-5" />
          {loading ? "Sending..." : "Send code"}
        </Button>
      ) : (
        <Button className="w-full" size="xl" onClick={verifyOtp} disabled={loading || otp.length !== 6}>
          <ShieldCheck className="h-5 w-5" />
          {loading ? "Checking..." : "Sign in"}
        </Button>
      )}

      {step === "otp" && (
        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-brand"
          onClick={() => {
            setStep("email");
            setOtp("");
            setMessage(null);
          }}
        >
          Use a different email
        </button>
      )}
    </GlassCard>
  );
}
