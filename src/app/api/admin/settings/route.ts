import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { getParkingSettings, updateParkingSettings } from "@/lib/server/admin-settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const settings = await getParkingSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to load settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const settings = await updateParkingSettings(body, actor);
    revalidateParkingPages();
    return NextResponse.json({ settings });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to update settings." }, { status: 500 });
  }
}

function revalidateParkingPages() {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/admin");
    revalidatePath("/parking/settings");
    revalidatePath("/parking/visits");
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
