import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authErrorResponse, requireParkingUser } from "@/lib/server/auth";
import {
  assertVisitorTypeCode,
  assertPurpose,
  rejectVisitorPassScan,
  reviewVisitorPass,
  scanVisitorPass,
  type VisitorDetailsUpdateInput,
} from "@/lib/server/visitors";
import { assertScanAction } from "@/lib/server/visitor-state";

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

  if ("vehicleNumber" in body) {
    const vehicleNumber = String(body.vehicleNumber ?? "").trim();
    if (!vehicleNumber) throw new Error("Vehicle number is required.");
    if (tooLong(vehicleNumber, LIMITS.vehicleNumber)) throw new Error("Visitor payload exceeds allowed field length.");
    details.vehicleNumber = vehicleNumber;
  }

  if ("typeCode" in body) {
    details.typeCode = assertVisitorTypeCode(body.typeCode);
  }

  if ("purpose" in body) {
    details.purpose = assertPurpose(body.purpose);
  }

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
      revalidateParkingPages(visitor.id);
      return NextResponse.json({ visitor });
    }

    if (body.action === "reject") {
      const reason = String(body.reason ?? "").trim();
      if (tooLong(reason, LIMITS.rejectReason)) {
        return NextResponse.json({ error: "Reject reason is too long." }, { status: 400 });
      }
      const visitor = await rejectVisitorPassScan({ token, guardId: actor.id, reason });
      revalidateParkingPages(visitor.id);
      return NextResponse.json({ visitor });
    }

    const action = assertScanAction(body.action);
    const visitor = await scanVisitorPass({
      token,
      action,
      guardId: actor.id,
      details: parseVisitorDetails(body.visitor),
    });
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
      message.includes("not valid") ||
      message.includes("expired") ||
      message.includes("cancelled") ||
      message.includes("required") ||
      message.includes("Notes are required") ||
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
    revalidatePath("/parking/arrival");
    revalidatePath(`/parking/visit/${visitorId}`);
  } catch {
    // Direct test invocation does not always provide Next's static generation store.
  }
}
