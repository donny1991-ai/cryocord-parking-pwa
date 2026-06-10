import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VehiclesAdmin } from "@/components/parking/vehicles-admin";
import { getParkingVehicles } from "@/lib/server/parking-data";
import { getHostDirectory } from "@/lib/server/hosts";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const metadata: Metadata = { title: "Vehicle Registry" };

export default async function VehiclesPage() {
  await requireParkingPageUser(["admin"]);
  const [vehicles, employees] = await Promise.all([getParkingVehicles(), getHostDirectory()]);

  return (
    <div>
      <PageHeader title="Vehicle Registry" subtitle="Staff & known vehicles · blacklist" backHref="/parking/admin" />
      <VehiclesAdmin vehicles={vehicles} employees={employees} />
    </div>
  );
}
