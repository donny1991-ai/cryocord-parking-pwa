import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ExitFlow } from "@/components/parking/exit-flow";

export const metadata: Metadata = { title: "Log Exit" };

export default function ExitPage() {
  return (
    <div>
      <PageHeader title="Log Exit" subtitle="Scan a pass or pick a vehicle on site" backHref="/parking" />
      <ExitFlow />
    </div>
  );
}
