import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import {
  createAdminOption,
  createPurposeRule,
  deleteAdminOption,
  deletePurposeRule,
  getParkingAdminOptions,
  updateAdminOption,
  updatePurposeRule,
} from "@/lib/server/admin-options";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const options = await getParkingAdminOptions();
    return NextResponse.json({ options });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });
    return NextResponse.json({ error: "Unable to load admin options." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const result = body.kind === "purposeRule" ? await createPurposeRule(body) : await createAdminOption(body);
    revalidateOptionPages();
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create option.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const result = body.kind === "purposeRule" ? await updatePurposeRule(body) : await updateAdminOption(body);
    revalidateOptionPages();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to update option.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const result = body.kind === "purposeRule" ? await deletePurposeRule(body) : await deleteAdminOption(body);
    revalidateOptionPages();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to remove option.");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const authError = authErrorResponse(error);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

function revalidateOptionPages() {
  try {
    revalidatePath("/parking/settings");
    revalidatePath("/parking/entry");
    revalidatePath("/register");
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
