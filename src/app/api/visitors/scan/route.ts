import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import { invalidateParkingReadModelCache } from "@/lib/server/parking-cache";
import {
  assertVisitorTypeCode,
  assertPurpose,
  rejectVisitorPassScan,
  reviewVisitorPass,
  reviewVisitorPassForExit,
  scanVisitorPass,
  type VisitorDetailsUpdateInput,
} from "@/lib/server/visitors";
import { assertScanAction } from "@/lib/server/visitor-state";

export const runtime = "nodejs";

const LIMITS = {
  name: 160,
  phoneNumber: 40,
  organisation: 160,
  representingOrganisation: 160,
  nric: 14,
  passportNumber: 20,
  vehicleNumber: 32,
  additionalVehicleNumber: 32,
  otherVisitorName: 160,
  remarks: 2000,
  hostStaffId: 80,
  hostDepartment: 120,
  flagReason: 2000,
  rejectReason: 500,
};

function tooLong(value: string, max: number) {
  return value.length > max;
}

function parseNullableString(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  if (tooLong(text, max)) {
    throw new Error("Visitor payload exceeds allowed field length.");
  }
  return text || null;
}

function parseNullableVisitTime(value: unknown) {
  const time = String(value ?? "").trim();
  if (!time) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Visit time must use HH:mm format.");
  const [hour, minute] = time.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Visit time is invalid.");
  return time;
}

function parseNullableVisitorCount(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    throw new Error("Number of visitors must be between 1 and 999.");
  }
  return count;
}

function parseVisitorDetails(value: unknown): VisitorDetailsUpdateInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  const details: VisitorDetailsUpdateInput = {};

  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new Error("Visitor name is required.");
    if (tooLong(name, LIMITS.name)) throw new Error("Visitor payload exceeds allowed field length.");
    details.name = name;
  }

  if ("phoneNumber" in body) {
    const phoneNumber = String(body.phoneNumber ?? "").trim();
    if (!phoneNumber) throw new Error("Contact number is required.");
    if (tooLong(phoneNumber, LIMITS.phoneNumber)) throw new Error("Visitor payload exceeds allowed field length.");
    details.phoneNumber = phoneNumber;
  }

  if ("organisation" in body) {
    details.organisation = parseNullableString(body.organisation, LIMITS.organisation);
  }
  if ("representingOrganisation" in body) {
    details.representingOrganisation = parseNullableString(
      body.representingOrganisation,
      LIMITS.representingOrganisation,
    );
  }

  if ("identityType" in body) details.identityType = body.identityType === "passport" ? "passport" : "nric";
  if ("nric" in body) details.nric = parseNullableString(body.nric, LIMITS.nric);
  if ("passportNumber" in body) details.passportNumber = parseNullableString(body.passportNumber, LIMITS.passportNumber);

  if ("vehicleNumber" in body) {
    const vehicleNumber = String(body.vehicleNumber ?? "").trim();
    if (!vehicleNumber) throw new Error("Vehicle number is required.");
    if (tooLong(vehicleNumber, LIMITS.vehicleNumber)) throw new Error("Visitor payload exceeds allowed field length.");
    details.vehicleNumber = vehicleNumber;
  }

  if ("additionalVehicleNumbers" in body) {
    if (!Array.isArray(body.additionalVehicleNumbers)) {
      details.additionalVehicleNumbers = [];
    } else {
      details.additionalVehicleNumbers = body.additionalVehicleNumbers
        .map((plate) => String(plate ?? "").trim())
        .filter(Boolean);
      if (details.additionalVehicleNumbers.some((plate) => tooLong(plate, LIMITS.additionalVehicleNumber))) {
        throw new Error("Visitor payload exceeds allowed field length.");
      }
    }
  }

  if ("otherVisitorNames" in body) {
    if (!Array.isArray(body.otherVisitorNames)) {
      details.otherVisitorNames = [];
    } else {
      details.otherVisitorNames = body.otherVisitorNames
        .map((name) => String(name ?? "").trim())
        .filter(Boolean);
      if (details.otherVisitorNames.some((name) => tooLong(name, LIMITS.otherVisitorName))) {
        throw new Error("Visitor payload exceeds allowed field length.");
      }
    }
  }

  if ("typeCode" in body) {
    details.typeCode = assertVisitorTypeCode(body.typeCode);
  }

  if ("purpose" in body) {
    details.purpose = assertPurpose(body.purpose);
  }

  if ("visitTime" in body) details.visitTime = parseNullableVisitTime(body.visitTime);
  if ("visitorCount" in body) details.visitorCount = parseNullableVisitorCount(body.visitorCount);

  if ("remarks" in body) details.remarks = parseNullableString(body.remarks, LIMITS.remarks);
  if ("hostStaffId" in body) details.hostStaffId = parseNullableString(body.hostStaffId, LIMITS.hostStaffId);
  if ("hostDepartment" in body) {
    details.hostDepartment = parseNullableString(body.hostDepartment, LIMITS.hostDepartment);
  }
  if ("flagReason" in body) details.flagReason = parseNullableString(body.flagReason, LIMITS.flagReason);

  return Object.keys(details).length > 0 ? details : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireParkingUser(request);
    const body = await request.json();
    const token = String(body.token ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "QR token is required." }, { status: 400 });
    }

    if (body.action === "review") {
      const visitor = await reviewVisitorPass({ token, guardId: actor.id });
      await invalidateParkingReadModelCache();
      revalidateParkingPages(visitor.id);
      return NextResponse.json({ visitor });
    }

    if (body.action === "review_exit") {
      const visitor = await reviewVisitorPassForExit({ token, guardId: actor.id });
      await invalidateParkingReadModelCache();
      revalidateParkingPages(visitor.id);
      return NextResponse.json({ visitor });
    }

    if (body.action === "reject") {
      const reason = String(body.reason ?? "").trim();
      if (tooLong(reason, LIMITS.rejectReason)) {
        return NextResponse.json({ error: "Reject reason is too long." }, { status: 400 });
      }
      const visitor = await rejectVisitorPassScan({
        token,
        guardId: actor.id,
        vehicleNumber: typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim() : undefined,
        reason,
      });
      await invalidateParkingReadModelCache();
      revalidateParkingPages(visitor.id);
      return NextResponse.json({ visitor });
    }

    const action = assertScanAction(body.action);
    const visitor = await scanVisitorPass({
      token,
      action,
      vehicleNumber: typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim() : undefined,
      guardId: actor.id,
      details: parseVisitorDetails(body.visitor),
    });
    await invalidateParkingReadModelCache();
    revalidateParkingPages(visitor.id);
    return NextResponse.json({ visitor });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status });
    }

    const message = error instanceof Error ? error.message : "Unable to process visitor scan.";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Invalid") ||
      message === "Invalid purpose." ||
      message.includes("already") ||
      message.includes("must check in") ||
      message.includes("Remarks are required") ||
      message.includes("NRIC") ||
      message.includes("Passport") ||
      message.includes("Identity document") ||
      message.includes("currently checked in") ||
      message.includes("Vehicle") ||
      message.includes("vehicle") ||
      message.includes("Select a vehicle") ||
      message.includes("not valid") ||
      message.includes("expired") ||
      message.includes("cancelled") ||
      message.includes("required") ||
      message.startsWith("Visit time") ||
      message.includes("Number of visitors") ||
      message.includes("exceeds")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Visitor type reference data is missing")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to process visitor scan." }, { status: 500 });
  }
}

function revalidateParkingPages(visitorId: string) {
  try {
    revalidatePath("/parking");
    revalidatePath("/parking/visits");
    revalidatePath("/parking/exit");
    revalidatePath("/parking/entry");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
