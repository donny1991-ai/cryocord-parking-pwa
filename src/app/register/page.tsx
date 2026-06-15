import type { Metadata } from "next";
import { PublicVisitorRequestForm } from "@/components/parking/public-visitor-request-form";
import { getParkingAdminOptions } from "@/lib/server/admin-options";

export const metadata: Metadata = {
  title: "Visitor Registration",
  description: "Public visitor registration request for CryoCord premises entry.",
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const options = await getParkingAdminOptions();

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col justify-center px-4 py-6">
      <PublicVisitorRequestForm options={options} />
    </main>
  );
}
