import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsAdmin } from "@/components/parking/settings-admin";
import { getParkingSettings } from "@/lib/server/admin-settings";
import { getParkingAdminOptions } from "@/lib/server/admin-options";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const metadata: Metadata = { title: "System Configuration" };

export default async function SettingsPage() {
  await requireParkingPageUser(["admin"]);
  const [settings, options] = await Promise.all([getParkingSettings(), getParkingAdminOptions()]);

  return (
    <div>
      <PageHeader
        title="System Configuration"
        subtitle="Companies, visitor types, purposes, auth expiry, and overstay policy"
        backHref="/parking/admin"
      />
      <SettingsAdmin settings={settings} options={options} />
    </div>
  );
}
