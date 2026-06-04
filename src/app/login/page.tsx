import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { LoginForm } from "@/components/auth/login-form";
import { PARKING_SESSION_COOKIE, getParkingUserForToken } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign In" };

export default async function LoginPage() {
  const token = (await cookies()).get(PARKING_SESSION_COOKIE)?.value;
  if (token) {
    let validSession = false;
    try {
      await getParkingUserForToken(token);
      validSession = true;
    } catch {
      // Let the login form replace an invalid or expired cookie.
    }
    if (validSession) {
      redirect("/parking");
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-5 text-center">
          <div className="flex justify-center">
            <Logo size={34} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">Parking sign in</h1>
            <p className="mt-1 text-sm text-ink-faint">Use the 6-digit code sent to your staff email.</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
