import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VisitorRequestsReview } from "@/components/parking/visitor-requests-review";
import { WallRegistrationQr } from "@/components/parking/wall-registration-qr";
import { getHostDirectory } from "@/lib/server/hosts";
import { getVisitorRequests } from "@/lib/server/visitor-requests";

export const metadata: Metadata = { title: "Public Registrations" };

export default async function VisitorRequestsPage() {
  const [requests, employees] = await Promise.all([getVisitorRequests(), getHostDirectory()]);
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/register`
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader title="Public Registrations" subtitle="Review wall-QR submissions before entry" backHref="/parking" />
      <WallRegistrationQr configuredUrl={configuredUrl} />
      <VisitorRequestsReview requests={requests} employees={employees} />
    </div>
  );
}
