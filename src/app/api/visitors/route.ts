import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { assertPurpose, assertVisitDate, assertVisitorTypeCode, createVisitorPass } from "@/lib/server/visitors";

export const runtime = "nodejs";

const LIMITS = {
  name: 160,
  phoneNumber: 40,
  organisation: 160,
  nric: 14,
  passportNumber: 20,
  vehicleNumber: 32,
  additionalVehicleNumber: 32,
  remarks: 2000,
  hostStaffId: 80,
  hostDepartment: 120,
  flagReason: 2000,
};

function tooLong(value: string, max: number) {
  return value.length > max;
}

function parseAdditionalVehicleNumbers(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [];
  return value.map((plate) => String(plate ?? "").trim()).filter(Boolean);
}

function parseVisitTime(value: unknown) {
  const time = String(value ?? "").trim();
  if (!time) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Visit time must use HH:mm format.");
  const [hour, minute] = time.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Visit time is invalid.");
  return time;
}

function parseVisitorCount(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    throw new Error("Number of visitors must be between 1 and 999.");
  }
  return count;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireParkingUser(request);
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phoneNumber = String(body.phoneNumber ?? "").trim();
    const organisation = String(body.organisation ?? "").trim();
    const nric = String(body.nric ?? "").trim();
    const passportNumber = String(body.passportNumber ?? "").trim();
    const identityType = body.identityType === "passport" || body.identityType === "nric" ? body.identityType : undefined;
    const vehicleNumber = String(body.vehicleNumber ?? "").trim();
    const additionalVehicleNumbers = parseAdditionalVehicleNumbers(body.additionalVehicleNumbers);
    const typeCode = assertVisitorTypeCode(body.typeCode);
    const purpose = assertPurpose(body.purpose);
    const visitDate = body.visitDate ? assertVisitDate(body.visitDate) : undefined;
    const visitTime = parseVisitTime(body.visitTime);
    const visitorCount = parseVisitorCount(body.visitorCount);
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
      tooLong(nric, LIMITS.nric) ||
      tooLong(passportNumber, LIMITS.passportNumber) ||
      tooLong(vehicleNumber, LIMITS.vehicleNumber) ||
      (additionalVehicleNumbers ?? []).some((plate) => tooLong(plate, LIMITS.additionalVehicleNumber)) ||
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
      identityType,
      nric: nric || undefined,
      passportNumber: passportNumber || undefined,
      vehicleNumber,
      additionalVehicleNumbers,
      typeCode,
      purpose,
      visitDate,
      visitTime,
      visitorCount,
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
      message.includes("Remarks are required") ||
      message.includes("NRIC") ||
      message.includes("Passport") ||
      message.includes("Identity document") ||
      message.startsWith("Visit date") ||
      message.startsWith("Visit time") ||
      message.includes("Number of visitors")
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
