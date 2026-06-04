import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsAdmin } from "@/components/parking/settings-admin";
import { getParkingSettings } from "@/lib/server/admin-settings";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const metadata: Metadata = { title: "Admin Settings" };

export default async function SettingsPage() {
  await requireParkingPageUser(["admin"]);
  const settings = await getParkingSettings();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Auth expiry and overstay policy" backHref="/parking/admin" />
      <SettingsAdmin settings={settings} />
    </div>
  );
}
