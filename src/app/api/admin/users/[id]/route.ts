import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { deactivateParkingUser, updateParkingUser } from "@/lib/server/admin-users";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const user = await updateParkingUser(id, body, actor);
    revalidateUserPages();
    return NextResponse.json({ user });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to update user." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const user = await deactivateParkingUser(id, actor);
    revalidateUserPages();
    return NextResponse.json({ user });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to deactivate user." }, { status: 500 });
  }
}

function revalidateUserPages() {
  try {
    revalidatePath("/parking/admin");
    revalidatePath("/parking/users");
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
