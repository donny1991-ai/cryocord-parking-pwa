import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { scanVisitorPass } from "@/lib/server/visitors";
import { assertScanAction } from "@/lib/server/visitor-state";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireParkingUser(request);
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const action = assertScanAction(body.action);

    if (!token) {
      return NextResponse.json({ error: "QR token is required." }, { status: 400 });
    }

    const visitor = await scanVisitorPass({ token, action, guardId: actor.id });
    revalidateParkingPages(visitor.id);
    return NextResponse.json({ visitor });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to process visitor scan.";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Invalid") ||
      message.includes("already") ||
      message.includes("must check in") ||
      message.includes("not valid")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to process visitor scan." }, { status: 500 });
  }
}

function revalidateParkingPages(visitorId: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/visits");
    revalidatePath("/parking/exit");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
