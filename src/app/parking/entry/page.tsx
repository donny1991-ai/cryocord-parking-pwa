import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EntryWorkflow } from "@/components/parking/entry-workflow";
import { getParkingVehicles } from "@/lib/server/parking-data";
import { getHostDirectory } from "@/lib/server/hosts";

export const metadata: Metadata = { title: "Gate Entry" };

export default async function EntryPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const [employees, vehicles] = await Promise.all([getHostDirectory(), getParkingVehicles()]);
  const params = await searchParams;
  const initialMode = params?.mode === "qr" ? "qr" : "plate";

  return (
    <div>
      <PageHeader title="Gate Entry" subtitle="Manual plate entry or visitor QR arrival" backHref="/parking" />
      <EntryWorkflow employees={employees} vehicles={vehicles} initialMode={initialMode} />
    </div>
  );
}
