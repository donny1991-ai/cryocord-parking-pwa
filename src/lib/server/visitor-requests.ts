import "server-only";
import { VisitorRequestSchema } from "@/db/entities";
import type { VisitorRequestEntity, VisitorRequestStatus } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { type AuthenticatedParkingUser } from "@/lib/server/auth";
import { getHostByStaffId } from "@/lib/server/hosts";
import { assertPurpose, assertVisitorTypeCode, createVisitorPass, normaliseVisitorCount, visitTypeRequiresHost, type IssuedVisitorPass } from "@/lib/server/visitors";
import type { IdentityType, VisitorTypeCode } from "@/lib/server/visitors";
import type { Purpose } from "@/lib/enums";
import type { VisitorRequest } from "@/lib/types";
import { normalisePlate } from "@/lib/utils";

export interface PublicVisitorRequestInput {
  name: string;
  phoneNumber: string;
  organisation?: string;
  representingOrganisation?: string;
  identityType?: IdentityType;
  nric?: string | null;
  passportNumber?: string | null;
  vehicleNumber: string;
  typeCode?: VisitorTypeCode;
  purpose?: Purpose;
  visitorCount?: number | string | null;
  otherVisitorNames?: string[];
  requestedHostText?: string;
  remarks?: string;
}

export type VisitorRequestDto = VisitorRequest;
export type PublicVisitorRegistrationResult = IssuedVisitorPass & {
  requestedHostText: string;
};

const MALAYSIAN_NRIC_PLACE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "21", "22", "23", "24",
  "25", "26", "27", "28", "29", "30", "31", "32", "33", "34",
  "35", "36", "37", "38", "39", "40", "41", "42", "43", "44",
  "45", "46", "47", "48", "49", "50", "51", "52", "53", "54",
  "55", "56", "57", "58", "59", "82",
]);

function cleanText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function assertLength(value: string | null, max: number, label: string) {
  if (value && value.length > max) {
    throw new Error(`${label} must be ${max} characters or fewer.`);
  }
}

function normaliseNric(value: unknown, now = new Date()) {
  const digits = String(value ?? "").trim().replace(/[-\s]/g, "");
  if (!/^\d{12}$/.test(digits)) {
    throw new Error("NRIC must be a valid Malaysian NRIC number.");
  }

  const yy = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const currentYear = now.getFullYear();
  const fullYear = yy <= currentYear % 100 ? 2000 + yy : 1900 + yy;
  const parsed = new Date(Date.UTC(fullYear, month - 1, day));
  if (
    parsed.getUTCFullYear() !== fullYear ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getTime() > Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  ) {
    throw new Error("NRIC must be a valid Malaysian NRIC number.");
  }

  const placeCode = digits.slice(6, 8);
  if (!MALAYSIAN_NRIC_PLACE_CODES.has(placeCode) || digits.slice(8) === "0000") {
    throw new Error("NRIC must be a valid Malaysian NRIC number.");
  }

  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

function normalisePassport(value: unknown) {
  const passport = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{5,20}$/.test(passport) || !/\d/.test(passport)) {
    throw new Error("Passport number must contain 5 to 20 letters or digits and include at least one number.");
  }
  return passport;
}

function normaliseIdentity(input: PublicVisitorRequestInput) {
  const identityType = input.identityType === "passport" ? "passport" : "nric";
  if (identityType === "passport") {
    return {
      identityType: "passport" as const,
      nric: null,
      passportNumber: normalisePassport(input.passportNumber),
    };
  }
  return {
    identityType: "nric" as const,
    nric: normaliseNric(input.nric),
    passportNumber: null,
  };
}

function parseOtherVisitorNames(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [];
  const names: string[] = [];

  for (const raw of rawValues) {
    const name = cleanText(raw);
    if (!name) continue;
    if (name.length > 160) throw new Error("Other visitor names must be 160 characters or fewer.");
    names.push(name);
  }

  if (names.length > 998) {
    throw new Error("A registration can include up to 998 other visitor names.");
  }

  return names;
}

function toDto(request: VisitorRequestEntity): VisitorRequestDto {
  return {
    id: request.id,
    name: request.name,
    phoneNumber: request.phoneNumber,
    organisation: request.organisation ?? undefined,
    representingOrganisation: request.representingOrganisation ?? undefined,
    identityType: request.identityType,
    nric: request.nric ?? undefined,
    passportNumber: request.passportNumber ?? undefined,
    vehicleNumber: request.vehicleNumber,
    vehicleNumberNormalised: request.vehicleNumberNormalised,
    purpose: assertPurpose(request.purpose),
    visitorCount: request.visitorCount ?? undefined,
    otherVisitorNames: request.otherVisitorNames ?? [],
    requestedHostText: request.requestedHostText,
    remarks: request.remarks ?? undefined,
    status: request.status,
    convertedVisitorId: request.convertedVisitorId ?? undefined,
    reviewedBy: request.reviewedBy ?? undefined,
    reviewedAt: request.reviewedAt?.toISOString(),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function withRequestedHostRemark(remarks: string | null, requestedHostText: string) {
  if (!requestedHostText) return remarks;
  const requestedHostRemark = `Requested host: ${requestedHostText}`;
  return remarks ? `${requestedHostRemark}\n\n${remarks}` : requestedHostRemark;
}

export async function createPublicVisitorRequest(input: PublicVisitorRequestInput): Promise<PublicVisitorRegistrationResult> {
  const name = cleanText(input.name);
  const phoneNumber = cleanText(input.phoneNumber);
  const organisation = cleanOptionalText(input.organisation);
  const representingOrganisation = cleanOptionalText(input.representingOrganisation);
  const vehicleNumber = cleanText(input.vehicleNumber).toUpperCase();
  const requestedHostText = cleanText(input.requestedHostText);
  const remarks = cleanOptionalText(input.remarks);
  const visitorCount = normaliseVisitorCount(input.visitorCount);
  const otherVisitorNames = parseOtherVisitorNames(input.otherVisitorNames);
  const purpose = assertPurpose(input.purpose ?? "meeting");
  const typeCode = assertVisitorTypeCode(input.typeCode ?? "visitor");
  const hostRequired = visitTypeRequiresHost(typeCode);
  const identity = normaliseIdentity(input);

  if (!name || !phoneNumber || !vehicleNumber || (hostRequired && !requestedHostText)) {
    throw new Error(hostRequired
      ? "Name, phone number, vehicle number, and host are required."
      : "Name, phone number, and vehicle number are required.");
  }
  if (normalisePlate(vehicleNumber).length < 3) {
    throw new Error("Vehicle number must contain at least 3 letters or digits.");
  }

  assertLength(name, 160, "Name");
  assertLength(phoneNumber, 40, "Phone number");
  assertLength(organisation, 160, "Organisation");
  assertLength(representingOrganisation, 160, "Company represented");
  assertLength(vehicleNumber, 32, "Vehicle number");
  assertLength(requestedHostText, 160, "Host");
  assertLength(remarks, 2000, "Remarks");

  const issued = await createVisitorPass({
    name,
    phoneNumber,
    organisation: organisation ?? undefined,
    representingOrganisation: representingOrganisation ?? undefined,
    identityType: identity.identityType,
    nric: identity.nric,
    passportNumber: identity.passportNumber,
    vehicleNumber,
    typeCode,
    purpose,
    visitorCount,
    otherVisitorNames,
    remarks: withRequestedHostRemark(remarks, requestedHostText) ?? undefined,
    checkInOnCreate: false,
  });

  return { ...issued, requestedHostText };
}

export async function getVisitorRequests(status?: VisitorRequestStatus) {
  const ds = await getParkingDataSource();
  const requests = await ds.manager.find(VisitorRequestSchema, {
    where: status ? { status } : undefined,
    order: { createdAt: "DESC" },
  });
  return requests.map(toDto);
}

export async function convertVisitorRequest(
  id: string,
  input: { hostStaffId: string; checkInOnCreate?: boolean },
  actor: AuthenticatedParkingUser,
) {
  const ds = await getParkingDataSource();
  const request = await ds.manager.findOneBy(VisitorRequestSchema, { id });
  if (!request) throw new Error("Visitor request not found.");
  if (request.status !== "submitted") throw new Error("Visitor request has already been reviewed.");

  const host = await getHostByStaffId(input.hostStaffId);
  if (!host) throw new Error("Host must be selected from the HR directory.");

  const issued = await createVisitorPass({
    name: request.name,
    phoneNumber: request.phoneNumber,
    organisation: request.organisation ?? undefined,
    representingOrganisation: request.representingOrganisation ?? undefined,
    identityType: request.identityType,
    nric: request.nric,
    passportNumber: request.passportNumber,
    vehicleNumber: request.vehicleNumber,
    typeCode: "visitor",
    purpose: assertPurpose(request.purpose),
    visitorCount: request.visitorCount,
    otherVisitorNames: request.otherVisitorNames,
    remarks: request.remarks ?? undefined,
    hostStaffId: host.staffId,
    hostDepartment: host.department,
    guardId: actor.id,
    checkInOnCreate: input.checkInOnCreate !== false,
  });

  request.status = "converted";
  request.convertedVisitorId = issued.visitor.id;
  request.reviewedBy = actor.id;
  request.reviewedAt = new Date();
  await ds.manager.save(VisitorRequestSchema, request);

  return { request: toDto(request), issued };
}

export async function rejectVisitorRequest(id: string, actor: AuthenticatedParkingUser) {
  const ds = await getParkingDataSource();
  const request = await ds.manager.findOneBy(VisitorRequestSchema, { id });
  if (!request) throw new Error("Visitor request not found.");
  if (request.status !== "submitted") throw new Error("Visitor request has already been reviewed.");

  request.status = "rejected";
  request.reviewedBy = actor.id;
  request.reviewedAt = new Date();
  await ds.manager.save(VisitorRequestSchema, request);

  return toDto(request);
}
