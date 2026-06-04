import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ExitFlow } from "@/components/parking/exit-flow";
import { getParkingSnapshot } from "@/lib/server/parking-data";

export const metadata: Metadata = { title: "Log Exit" };

export default async function ExitPage({
  searchParams,
}: {
  searchParams?: Promise<{ visitId?: string | string[] }>;
}) {
  const snapshot = await getParkingSnapshot();
  const params = await searchParams;
  const visitId = Array.isArray(params?.visitId) ? params?.visitId[0] : params?.visitId;

  return (
    <div>
      <PageHeader title="Log Exit" subtitle="Scan a pass or pick a vehicle on site" backHref="/parking" />
      <ExitFlow insideVisits={snapshot.insideVisits} nowIso={snapshot.now.toISOString()} initialVisitId={visitId} />
    </div>
  );
}
