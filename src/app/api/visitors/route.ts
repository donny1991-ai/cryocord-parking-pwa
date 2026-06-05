import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { assertPurpose, assertVisitDate, assertVisitorTypeCode, createVisitorPass } from "@/lib/server/visitors";

export const runtime = "nodejs";

const LIMITS = {
  name: 160,
  phoneNumber: 40,
  organisation: 160,
  vehicleNumber: 32,
  remarks: 2000,
  hostStaffId: 80,
  hostDepartment: 120,
  flagReason: 2000,
};

function tooLong(value: string, max: number) {
  return value.length > max;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireParkingUser(request);
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phoneNumber = String(body.phoneNumber ?? "").trim();
    const organisation = String(body.organisation ?? "").trim();
    const vehicleNumber = String(body.vehicleNumber ?? "").trim();
    const typeCode = assertVisitorTypeCode(body.typeCode);
    const purpose = assertPurpose(body.purpose);
    const visitDate = body.visitDate ? assertVisitDate(body.visitDate) : undefined;
    const remarks = String(body.remarks ?? "").trim();
    const hostStaffId = String(body.hostStaffId ?? "").trim();
    const hostDepartment = String(body.hostDepartment ?? "").trim();
    const flagReason = String(body.flagReason ?? "").trim();

    if (!name || !phoneNumber || !vehicleNumber) {
      return NextResponse.json(
        { error: "Name, phone number, and vehicle number are required." },
        { status: 400 },
      );
    }

    if (
      tooLong(name, LIMITS.name) ||
      tooLong(phoneNumber, LIMITS.phoneNumber) ||
      tooLong(organisation, LIMITS.organisation) ||
      tooLong(vehicleNumber, LIMITS.vehicleNumber) ||
      tooLong(remarks, LIMITS.remarks) ||
      tooLong(hostStaffId, LIMITS.hostStaffId) ||
      tooLong(hostDepartment, LIMITS.hostDepartment) ||
      tooLong(flagReason, LIMITS.flagReason)
    ) {
      return NextResponse.json({ error: "Visitor payload exceeds allowed field length." }, { status: 400 });
    }

    const result = await createVisitorPass({
      name,
      phoneNumber,
      organisation,
      vehicleNumber,
      typeCode,
      purpose,
      visitDate,
      remarks,
      hostStaffId,
      hostDepartment,
      flagReason,
      guardId: actor.id,
      checkInOnCreate: body.checkInOnCreate === true,
    });

    revalidateParkingPages(result.visitor.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to create visitor pass.";
    const missingDb = message.includes("DATABASE_URL") || message.includes("SUPABASE_DB_URL");
    if (
      message === "Invalid visitor type." ||
      message === "Invalid purpose." ||
      message.startsWith("Visit date") ||
      message.includes("Notes are required")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (missingDb) {
      return NextResponse.json({ error: "Visitor database is not configured." }, { status: 503 });
    }
    if (message.includes("Visitor type reference data is missing")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to create visitor pass." }, { status: 500 });
  }
}

function revalidateParkingPages(visitorId: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/visits");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
