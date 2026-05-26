import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { NewEntryFlow } from "@/components/parking/new-entry-flow";

export const metadata: Metadata = { title: "New Entry" };

export default function EntryPage() {
  return (
    <div>
      <PageHeader title="New Entry" subtitle="Capture plate, log the visit, issue a pass" backHref="/parking" />
      <NewEntryFlow />
    </div>
  );
}
