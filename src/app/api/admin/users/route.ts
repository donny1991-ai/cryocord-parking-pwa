import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { createParkingUser, listParkingUsers } from "@/lib/server/admin-users";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const users = await listParkingUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to load users." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireParkingUser(request, ["admin"]);
    const body = await request.json();
    const user = await createParkingUser(body);
    revalidateUserPages();
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }
    return NextResponse.json({ error: "Unable to create user." }, { status: 500 });
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
