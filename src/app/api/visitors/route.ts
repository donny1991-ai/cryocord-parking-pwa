import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { assertVisitorTypeCode, createVisitorPass } from "@/lib/server/visitors";

export const runtime = "nodejs";

const LIMITS = {
  name: 160,
  phoneNumber: 40,
  vehicleNumber: 32,
  remarks: 2000,
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
    const vehicleNumber = String(body.vehicleNumber ?? "").trim();
    const typeCode = assertVisitorTypeCode(body.typeCode);
    const remarks = String(body.remarks ?? "").trim();

    if (!name || !phoneNumber || !vehicleNumber) {
      return NextResponse.json(
        { error: "Name, phone number, and vehicle number are required." },
        { status: 400 },
      );
    }

    if (
      tooLong(name, LIMITS.name) ||
      tooLong(phoneNumber, LIMITS.phoneNumber) ||
      tooLong(vehicleNumber, LIMITS.vehicleNumber) ||
      tooLong(remarks, LIMITS.remarks)
    ) {
      return NextResponse.json({ error: "Visitor payload exceeds allowed field length." }, { status: 400 });
    }

    const result = await createVisitorPass({
      name,
      phoneNumber,
      vehicleNumber,
      typeCode,
      remarks,
      guardId: actor.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to create visitor pass.";
    const missingDb = message.includes("DATABASE_URL") || message.includes("SUPABASE_DB_URL");
    if (message === "Invalid visitor type.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (missingDb) {
      return NextResponse.json({ error: "Visitor database is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to create visitor pass." }, { status: 500 });
  }
}
