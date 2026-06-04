import { TopBar } from "@/components/shell/top-bar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { requireParkingPageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ParkingLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireParkingPageUser();

  return (
    <div className="min-h-[100dvh]">
      <OfflineBanner />
      <TopBar guardName={actor.name} guardRole={actor.role} />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <BottomNav guardRole={actor.role} />
    </div>
  );
}
