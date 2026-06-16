import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createPublicVisitorRequest } from "@/lib/server/visitor-requests";

export const runtime = "nodejs";

function isPublicRequestValidationError(message: string) {
  return (
    message.includes("required") ||
    message.includes("must") ||
    message.includes("Invalid visitor type") ||
    message.includes("Invalid purpose") ||
    message.includes("Number of visitors") ||
    message.includes("Other visitor names") ||
    message.includes("blacklisted") ||
    message.includes("already")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const registration = await createPublicVisitorRequest(body);
    revalidateRequestPages();
    return NextResponse.json(registration, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit visitor request.";
    if (isPublicRequestValidationError(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("[visitor-requests:public-create] unexpected failure", error);
    return NextResponse.json({ error: "Unable to submit visitor request." }, { status: 500 });
  }
}

function revalidateRequestPages() {
  try {
    revalidatePath("/parking/requests");
    revalidatePath("/parking/visits");
    revalidatePath("/parking");
  } catch {
    // Direct route invocation in integration tests does not always have a static generation store.
  }
}
