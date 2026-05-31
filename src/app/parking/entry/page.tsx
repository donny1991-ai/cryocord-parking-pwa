import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { NewEntryFlow } from "@/components/parking/new-entry-flow";
import { getDemoEmployees, getParkingVehicles } from "@/lib/server/parking-data";

export const metadata: Metadata = { title: "New Entry" };

export default async function EntryPage() {
  const vehicles = await getParkingVehicles();

  return (
    <div>
      <PageHeader title="New Entry" subtitle="Capture plate, log the visit, issue a pass" backHref="/parking" />
      <NewEntryFlow employees={getDemoEmployees()} vehicles={vehicles} />
    </div>
  );
}
