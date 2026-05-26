import type { Metadata } from "next";
import { PassView } from "@/components/parking/pass-view";

export const metadata: Metadata = { title: "Your Gate Pass" };

/** Public, visitor-facing pass page (no guard shell). Linked from WhatsApp. */
export default function PassPage({ params }: { params: { token: string } }) {
  // Next URL-decodes the route param; the token is the opaque QR value.
  const token = decodeURIComponent(params.token);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-5">
      <PassView token={token} />
    </main>
  );
}
