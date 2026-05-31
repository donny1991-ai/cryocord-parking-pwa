import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/shell/top-bar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { PARKING_SESSION_COOKIE, getParkingUserForToken } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function ParkingLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(PARKING_SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/login");
  }

  let actor;
  try {
    actor = await getParkingUserForToken(token);
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-[100dvh]">
      <OfflineBanner />
      <TopBar guardName={actor.name} guardRole={actor.role} />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
