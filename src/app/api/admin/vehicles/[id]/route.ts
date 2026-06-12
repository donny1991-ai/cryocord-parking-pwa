import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { invalidateVehicleReadModelCache } from "@/lib/server/parking-cache";
import { deleteParkingVehicle, updateParkingVehicle } from "@/lib/server/admin-vehicles";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const vehicle = await updateParkingVehicle(id, body);
    await invalidateVehicleReadModelCache();
    revalidateVehiclePages();
    return NextResponse.json({ vehicle });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to update vehicle." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireParkingUser(request, ["admin"]);
    const { id } = await params;
    const vehicle = await deleteParkingVehicle(id);
    await invalidateVehicleReadModelCache();
    revalidateVehiclePages();
    return NextResponse.json({ vehicle });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to delete vehicle." }, { status: 500 });
  }
}

function revalidateVehiclePages() {
  try {
    revalidatePath("/parking/vehicles");
    revalidatePath("/parking/admin");
    revalidatePath("/parking/entry");
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
