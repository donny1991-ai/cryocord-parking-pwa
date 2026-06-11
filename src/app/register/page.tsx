import type { Metadata } from "next";
import { PublicVisitorRequestForm } from "@/components/parking/public-visitor-request-form";

export const metadata: Metadata = {
  title: "Visitor Registration",
  description: "Public visitor registration request for CryoCord premises entry.",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col justify-center px-4 py-6">
      <PublicVisitorRequestForm />
    </main>
  );
}
