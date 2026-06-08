import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { NewEntryFlow } from "@/components/parking/new-entry-flow";
import { getParkingVehicles } from "@/lib/server/parking-data";
import { getHostDirectory } from "@/lib/server/hosts";

export const metadata: Metadata = { title: "New Entry" };

export default async function EntryPage() {
  const [employees, vehicles] = await Promise.all([getHostDirectory(), getParkingVehicles()]);

  return (
    <div>
      <PageHeader title="New Entry" subtitle="Capture plate, log the visit, issue a pass" backHref="/parking" />
      <NewEntryFlow employees={employees} vehicles={vehicles} />
    </div>
  );
}
