import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VisitsList } from "@/components/parking/visits-list";
import { getParkingSnapshot } from "@/lib/server/parking-data";

export const metadata: Metadata = { title: "Visit Log" };

export default async function VisitsPage() {
  const snapshot = await getParkingSnapshot();

  return (
    <div>
      <PageHeader title="Visit Log" subtitle="Search and filter today's register" backHref="/parking" />
      <VisitsList visits={snapshot.logVisits} nowIso={snapshot.now.toISOString()} />
    </div>
  );
}
