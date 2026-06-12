import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { invalidateParkingReadModelCache } from "@/lib/server/parking-cache";
import { convertVisitorRequest, rejectVisitorRequest } from "@/lib/server/visitor-requests";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function revalidateRequestPages(visitorId?: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/requests");
    revalidatePath("/parking/visits");
    if (visitorId) revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct route invocation in integration tests does not always have a static generation store.
  }
}

function statusForReviewError(message: string) {
  if (message.includes("not found")) return 404;
  if (
    message.includes("already been reviewed") ||
    message.includes("Host must be selected") ||
    message.includes("blacklisted") ||
    message.includes("already checked in")
  ) {
    return 400;
  }
  return 500;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireParkingUser(request);
    const { id } = await context.params;
    const body = await request.json();

    if (body.action === "reject") {
      const visitorRequest = await rejectVisitorRequest(id, actor);
      revalidateRequestPages();
      return NextResponse.json({ request: visitorRequest });
    }

    const result = await convertVisitorRequest(
      id,
      {
        hostStaffId: String(body.hostStaffId ?? ""),
        checkInOnCreate: body.checkInOnCreate !== false,
      },
      actor,
    );
    await invalidateParkingReadModelCache();
    revalidateRequestPages(result.issued.visitor.id);
    return NextResponse.json(result);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to review visitor request.";
    const status = statusForReviewError(message);
    if (status >= 500) {
      console.error("[visitor-requests:review] unexpected failure", error);
      return NextResponse.json({ error: "Unable to review visitor request." }, { status });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
