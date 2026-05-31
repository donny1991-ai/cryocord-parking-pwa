import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ArrivalScanFlow } from "@/components/parking/arrival-scan-flow";

export const metadata: Metadata = { title: "Arrival Scan" };

export default function ArrivalPage() {
  return (
    <div>
      <PageHeader title="Arrival Scan" subtitle="Scan a pre-registered pass to check in" backHref="/parking" />
      <ArrivalScanFlow />
    </div>
  );
}
