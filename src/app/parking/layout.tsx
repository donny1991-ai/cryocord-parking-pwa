import { TopBar } from "@/components/shell/top-bar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineBanner } from "@/components/shell/offline-banner";

export default function ParkingLayout({ children }: { children: React.ReactNode }) {
  // Guard identity comes from the shared auth JWT (staff_id + role claim).
  const guardName = "Aziz Rahman";

  return (
    <div className="min-h-[100dvh]">
      <OfflineBanner />
      <TopBar guardName={guardName} />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
