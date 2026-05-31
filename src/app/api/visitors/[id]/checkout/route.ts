import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { checkOutVisitorById } from "@/lib/server/visitors";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireParkingUser(_request);
    const { id } = await params;
    const visitor = await checkOutVisitorById({ visitorId: id, guardId: actor.id });
    revalidateParkingPages(visitor.id);
    return NextResponse.json({ visitor });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to process visitor checkout.";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("already") || message.includes("must check in")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to process visitor checkout." }, { status: 500 });
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
