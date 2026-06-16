import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { EntryWorkflow } from "@/components/parking/entry-workflow";
import { getParkingVehicles } from "@/lib/server/parking-data";
import { getParkingAdminOptions } from "@/lib/server/admin-options";
import { getHostDirectory } from "@/lib/server/hosts";

export const metadata: Metadata = { title: "Gate Entry" };

export default async function EntryPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const [employees, vehicles, options] = await Promise.all([
    getHostDirectory(),
    getParkingVehicles(),
    getParkingAdminOptions(),
  ]);
  const params = await searchParams;
  const initialMode = params?.mode === "plate" ? "plate" : "qr";

  return (
    <div>
      <PageHeader title="Gate Entry" subtitle="Scan a plate for new entry or scan a visitor QR for arrival" backHref="/parking" />
      <EntryWorkflow employees={employees} vehicles={vehicles} options={options} initialMode={initialMode} />
    </div>
  );
}
