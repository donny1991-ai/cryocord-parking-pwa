import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VehiclesAdmin } from "@/components/parking/vehicles-admin";
import { getParkingVehicles } from "@/lib/server/parking-data";

export const metadata: Metadata = { title: "Vehicle Registry" };

export default async function VehiclesPage() {
  const vehicles = await getParkingVehicles();

  return (
    <div>
      <PageHeader title="Vehicle Registry" subtitle="Staff & known vehicles · blacklist" backHref="/parking/admin" />
      <VehiclesAdmin vehicles={vehicles} />
    </div>
  );
}
