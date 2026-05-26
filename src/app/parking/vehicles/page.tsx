import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VehiclesAdmin } from "@/components/parking/vehicles-admin";

export const metadata: Metadata = { title: "Vehicle Registry" };

export default function VehiclesPage() {
  return (
    <div>
      <PageHeader title="Vehicle Registry" subtitle="Staff & known vehicles · blacklist" backHref="/parking/admin" />
      <VehiclesAdmin />
    </div>
  );
}
