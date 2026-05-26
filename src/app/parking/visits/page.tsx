import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { VisitsList } from "@/components/parking/visits-list";

export const metadata: Metadata = { title: "Visit Log" };

export default function VisitsPage() {
  return (
    <div>
      <PageHeader title="Visit Log" subtitle="Search and filter today's register" backHref="/parking" />
      <VisitsList />
    </div>
  );
}
