import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { WallRegistrationQr } from "@/components/parking/wall-registration-qr";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const metadata: Metadata = { title: "Public Registrations" };

export default async function VisitorRequestsPage() {
  await requireParkingPageUser(["admin"]);
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/register`
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Public Registrations" subtitle="Print the wall QR poster for visitor self-registration" backHref="/parking" />
      <WallRegistrationQr configuredUrl={configuredUrl} />
    </div>
  );
}
