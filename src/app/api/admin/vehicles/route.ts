import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { createParkingVehicle } from "@/lib/server/admin-vehicles";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const vehicle = await createParkingVehicle(body);
    revalidateVehiclePages();
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to create vehicle." }, { status: 500 });
  }
}

function revalidateVehiclePages() {
  try {
    revalidatePath("/parking/vehicles");
    revalidatePath("/parking/admin");
    revalidatePath("/parking/entry");
    revalidatePath("/parking/pre-register");
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
