import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { clearVisitorFlag, flagVisitor } from "@/lib/server/admin-visitors";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const result = await flagVisitor(id, body, actor);
    revalidateVisitorPages(id);
    return NextResponse.json({ visitor: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to flag visitor." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const result = await clearVisitorFlag(id);
    revalidateVisitorPages(id);
    return NextResponse.json({ visitor: result });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to clear visitor flag." }, { status: 500 });
  }
}

function revalidateVisitorPages(visitorId: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/admin");
    revalidatePath("/parking/visits");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
