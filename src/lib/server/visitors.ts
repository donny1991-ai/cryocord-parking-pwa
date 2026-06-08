import "server-only";
import { VisitorScanEventSchema, VisitorSchema, VisitorTypeSchema, VisitorVehicleSchema } from "@/db/entities";
import type { VisitorEntity, VisitorStatus, VisitorVehicleEntity, VisitorVehicleStatus } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { PURPOSES, type Purpose } from "@/lib/enums";
import { getHostByStaffId } from "@/lib/server/hosts";
import type { Employee } from "@/lib/types";
import {
  assertQrSigningConfigured,
  decodeVisitTokenReference,
  getPreRegistrationTokenExpiresAt,
  getVisitTokenExpiresAt,
  signVisitToken,
  verifyVisitToken,
  type PassClaims,
} from "@/lib/qr";
import { normalisePlate } from "@/lib/utils";
import { assertScanAction, type ScanAction } from "./visitor-state";
import type { EntityManager } from "typeorm";
import { decodeProtectedHeader } from "jose";

export type VisitorTypeCode =
  | "visitor"
  | "vendor"
  | "courier"
  | "patient"
  | "staff"
  | "contractor"
  | "vip"
  | "other";
export type IdentityType = "nric" | "passport";
export type { ScanAction } from "./visitor-state";

const MALAYSIAN_NRIC_PLACE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "21", "22", "23", "24",
  "25", "26", "27", "28", "29", "30", "31", "32", "33", "34",
  "35", "36", "37", "38", "39", "40", "41", "42", "43", "44",
  "45", "46", "47", "48", "49", "50", "51", "52", "53", "54",
  "55", "56", "57", "58", "59", "82",
]);

export interface CreateVisitorInput {
  name: string;
  phoneNumber: string;
  organisation?: string;
  identityType?: IdentityType;
  nric?: string | null;
  passportNumber?: string | null;
  vehicleNumber: string;
  additionalVehicleNumbers?: string[];
  typeCode: VisitorTypeCode;
  purpose?: Purpose;
  visitDate?: string;
  visitTime?: string | null;
  visitorCount?: number | string | null;
  remarks?: string;
  hostStaffId?: string;
  hostDepartment?: string;
  flagReason?: string;
  guardId?: string;
  checkInOnCreate?: boolean;
}

export interface ScanVisitorInput {
  token: string;
  action?: ScanAction;
  vehicleNumber?: string;
  guardId?: string;
  details?: VisitorDetailsUpdateInput;
}

export interface CheckOutVisitorInput {
  visitorId: string;
  vehicleNumber?: string;
  guardId?: string;
}

export interface CancelVisitorInput {
  visitorId: string;
  guardId?: string;
}

export interface ReviewVisitorPassInput {
  token: string;
  guardId?: string;
}

export interface RejectVisitorPassInput {
  token: string;
  vehicleNumber?: string;
  guardId?: string;
  reason?: string;
}

export interface VisitorDetailsUpdateInput {
  name?: string;
  phoneNumber?: string;
  organisation?: string | null;
  identityType?: IdentityType;
  nric?: string | null;
  passportNumber?: string | null;
  vehicleNumber?: string;
  additionalVehicleNumbers?: string[];
  typeCode?: VisitorTypeCode;
  purpose?: Purpose;
  visitTime?: string | null;
  visitorCount?: number | string | null;
  remarks?: string | null;
  hostStaffId?: string | null;
  hostDepartment?: string | null;
  flagReason?: string | null;
}

export interface VisitorDto {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  identityType: IdentityType | null;
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  additionalVehicleNumbers: string[];
  vehicles: VisitorVehicleDto[];
  activeVehicleNumber: string | null;
  checkedIn: string | null;
  checkedOut: string | null;
  typeCode: string;
  typeLabel: string;
  remarks: string | null;
  purpose: string;
  visitDate: string | null;
  visitTime: string | null;
  visitorCount: number | null;
  hostStaffId: string | null;
  hostDepartment: string | null;
  host: Employee | null;
  flagReason: string | null;
  status: VisitorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorVehicleDto {
  id: string;
  vehicleNumber: string;
  isPrimary: boolean;
  status: VisitorVehicleStatus;
  checkedIn: string | null;
  checkedOut: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
}

type ResolvedPassClaims = PassClaims & {
  verified: boolean;
  signatureAlgorithm?: string;
};

type PublicPassVisitorRow = Pick<VisitorEntity, "id" | "qrTokenJti" | "status" | "visitDate" | "createdAt">;

export interface IssuedVisitorPass {
  visitor: VisitorDto;
  token: string;
  tokenExpiresAt: string;
}

export type PublicVisitorPass =
  | {
      state: "active";
      token: string;
      status: Extract<VisitorStatus, "pending" | "checked_in">;
      heading: string;
      message: string;
      validUntil: string;
    }
  | {
      state: "inactive";
      title: string;
      message: string;
    };

function toVisitTimeInput(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

function toDto(visitor: VisitorEntity): VisitorDto {
  const vehicles = sortVisitorVehicles(visitor.vehicles ?? []).map(toVehicleDto);
  const activeVehicleNumber = vehicles.find((vehicle) => vehicle.status === "checked_in")?.vehicleNumber ?? null;

  return {
    id: visitor.id,
    name: visitor.name,
    phoneNumber: visitor.phoneNumber,
    organisation: visitor.organisation,
    identityType: visitor.identityType,
    nric: visitor.nric,
    passportNumber: visitor.passportNumber,
    vehicleNumber: visitor.vehicleNumber,
    additionalVehicleNumbers: visitor.additionalVehicleNumbers ?? [],
    vehicles,
    activeVehicleNumber,
    checkedIn: visitor.checkedIn?.toISOString() ?? null,
    checkedOut: visitor.checkedOut?.toISOString() ?? null,
    typeCode: visitor.type?.code ?? String(visitor.typeId),
    typeLabel: visitor.type?.label ?? "Unknown",
    remarks: visitor.remarks,
    purpose: visitor.purpose,
    visitDate: visitor.visitDate,
    visitTime: toVisitTimeInput(visitor.visitTime),
    visitorCount: visitor.visitorCount,
    hostStaffId: visitor.hostStaffId,
    hostDepartment: visitor.hostDepartment,
    host: null,
    flagReason: visitor.flagReason,
    status: visitor.status,
    createdAt: visitor.createdAt.toISOString(),
    updatedAt: visitor.updatedAt.toISOString(),
  };
}

async function hydrateVisitorHost(visitor: VisitorDto): Promise<VisitorDto> {
  const host = await getHostByStaffId(visitor.hostStaffId);
  if (!host) return visitor;
  return {
    ...visitor,
    host,
    hostDepartment: host.department || visitor.hostDepartment,
  };
}

function toVehicleDto(vehicle: VisitorVehicleEntity): VisitorVehicleDto {
  return {
    id: vehicle.id,
    vehicleNumber: vehicle.vehicleNumber,
    isPrimary: vehicle.isPrimary,
    status: vehicle.status,
    checkedIn: vehicle.checkedIn?.toISOString() ?? null,
    checkedOut: vehicle.checkedOut?.toISOString() ?? null,
    checkedInBy: vehicle.checkedInBy,
    checkedOutBy: vehicle.checkedOutBy,
  };
}

function sortVisitorVehicles(vehicles: VisitorVehicleEntity[]) {
  return [...vehicles].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.vehicleNumber.localeCompare(b.vehicleNumber);
  });
}

export function assertPurpose(value: unknown): Purpose {
  if (value === undefined || value === null || value === "") {
    return "other";
  }
  if (typeof value === "string" && (PURPOSES as readonly string[]).includes(value)) {
    return value as Purpose;
  }
  throw new Error("Invalid purpose.");
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

function normaliseIdentityDocument(input: {
  identityType?: IdentityType | null;
  nric?: string | null;
  passportNumber?: string | null;
  required?: boolean;
}): {
  identityType: IdentityType | null;
  nric: string | null;
  passportNumber: string | null;
} {
  const hasNric = String(input.nric ?? "").trim().replace(/[-\s]/g, "") !== "";
  const hasPassport = String(input.passportNumber ?? "").trim() !== "";

  if (!input.identityType && !hasNric && !hasPassport) {
    if (input.required) throw new Error("Identity document is required.");
    return { identityType: null, nric: null, passportNumber: null };
  }

  const identityType = input.identityType === "passport" || (!input.identityType && hasPassport && !hasNric)
    ? "passport"
    : "nric";

  if (identityType === "nric") {
    if (!hasNric) throw new Error("NRIC number is required.");
    return { identityType, nric: normaliseNric(input.nric), passportNumber: null };
  }

  if (!hasPassport) throw new Error("Passport number is required.");
  return { identityType, nric: null, passportNumber: normalisePassport(input.passportNumber) };
}

function requiresRemarks(typeCode: string, purpose: string) {
  return typeCode === "other" || purpose === "other";
}

function assertRemarksForOther(typeCode: string, purpose: string, remarks: string | null) {
  if (requiresRemarks(typeCode, purpose) && !remarks) {
    throw new Error("Remarks are required when visit type or purpose is Other.");
  }
}

async function getVisitorTypeByCodeOrThrow(manager: EntityManager, code: VisitorTypeCode) {
  const type = await manager.findOneBy(VisitorTypeSchema, { code });
  if (!type) {
    throw new Error(`Visitor type reference data is missing for "${code}". Run database migrations.`);
  }
  return type;
}

function getVisitorPolicyExpiresAt(visitor: Pick<VisitorEntity, "visitDate" | "createdAt">, claims?: ResolvedPassClaims) {
  if (visitor.visitDate) {
    return getPreRegistrationTokenExpiresAt(visitor.visitDate);
  }
  return claims?.verified && claims.expiresAt ? new Date(claims.expiresAt) : getVisitTokenExpiresAt(visitor.createdAt);
}

async function resolveVisitTokenReference(token: string): Promise<ResolvedPassClaims> {
  try {
    return {
      ...(await verifyVisitToken(token, { ignoreExpiration: true })),
      verified: true,
    };
  } catch {
    const signatureAlgorithm = decodeProtectedHeader(token).alg;
    return {
      ...decodeVisitTokenReference(token),
      verified: false,
      signatureAlgorithm,
    };
  }
}

function isVisitorTokenMatch(visitor: Pick<VisitorEntity, "qrTokenJti">, claims: ResolvedPassClaims) {
  if (visitor.qrTokenJti) {
    // Allows passes signed by a previous key to survive key rotation only when
    // the opaque DB token id still matches the visitor record. Unsigned tokens
    // remain invalid even if their decoded payload guesses the token id.
    return claims.tokenId === visitor.qrTokenJti && (claims.verified || claims.signatureAlgorithm === "HS256");
  }

  return claims.verified;
}

type VisitorDetailsChange = {
  from: string | number | null;
  to: string | number | null;
};

const IDENTITY_DETAIL_FIELDS = ["identityType", "nric", "passportNumber"] as const;

function pickIdentityDetailChanges(changes: Record<string, VisitorDetailsChange>) {
  const identityChanges: Record<string, VisitorDetailsChange> = {};
  for (const field of IDENTITY_DETAIL_FIELDS) {
    if (changes[field]) identityChanges[field] = changes[field];
  }

  return identityChanges;
}

function normaliseNullable(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

const MAX_ADDITIONAL_VEHICLE_NUMBERS = 20;

function parseAdditionalVehicleNumbers(value: unknown, primaryPlate: string): string[] {
  const rawValues = Array.isArray(value) ? value : [];
  const primaryNormalised = normalisePlate(primaryPlate);
  const seen = new Set<string>();
  const plates: string[] = [];

  for (const raw of rawValues) {
    const plate = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!plate) continue;
    if (plate.length > 32) throw new Error("Visitor payload exceeds allowed field length.");

    const normalised = normalisePlate(plate);
    if (normalised.length < 3) {
      throw new Error("Additional vehicle numbers must contain at least 3 letters or digits.");
    }
    if (normalised === primaryNormalised || seen.has(normalised)) continue;

    seen.add(normalised);
    plates.push(plate);
  }

  if (plates.length > MAX_ADDITIONAL_VEHICLE_NUMBERS) {
    throw new Error(`A registration can include up to ${MAX_ADDITIONAL_VEHICLE_NUMBERS} additional vehicle numbers.`);
  }

  return plates;
}

function registrationVehicleNumbers(visitor: Pick<VisitorEntity, "vehicleNumber" | "additionalVehicleNumbers">) {
  return [visitor.vehicleNumber, ...(visitor.additionalVehicleNumbers ?? [])];
}

async function getVisitorVehicles(manager: EntityManager, visitorId: string) {
  return sortVisitorVehicles(await manager.find(VisitorVehicleSchema, { where: { visitorId } }));
}

async function ensureVisitorVehicleRoster(manager: EntityManager, visitor: VisitorEntity) {
  return syncVisitorVehicleRoster(manager, visitor);
}

async function syncVisitorVehicleRoster(manager: EntityManager, visitor: VisitorEntity) {
  const existing = await getVisitorVehicles(manager, visitor.id);
  const byNormalised = new Map(existing.map((vehicle) => [vehicle.vehicleNumberNormalised, vehicle]));
  const desired = registrationVehicleNumbers(visitor).map((vehicleNumber, index) => ({
    vehicleNumber,
    vehicleNumberNormalised: normalisePlate(vehicleNumber),
    isPrimary: index === 0,
  }));
  const desiredNormalised = new Set(desired.map((vehicle) => vehicle.vehicleNumberNormalised));
  const existingRows: VisitorVehicleEntity[] = [];
  const newRows: VisitorVehicleEntity[] = [];

  for (const vehicle of desired) {
    const current = byNormalised.get(vehicle.vehicleNumberNormalised);
    if (current) {
      current.vehicleNumber = vehicle.vehicleNumber;
      current.isPrimary = vehicle.isPrimary;
      existingRows.push(current);
    } else {
      newRows.push(
        manager.create(VisitorVehicleSchema, {
          visitorId: visitor.id,
          ...vehicle,
          status: visitor.status === "cancelled" ? "cancelled" : "pending",
        }),
      );
    }
  }

  const removable = existing.filter((vehicle) => !desiredNormalised.has(vehicle.vehicleNumberNormalised));
  const occupied = removable.find((vehicle) => vehicle.status === "checked_in");
  if (occupied) {
    throw new Error(`Vehicle ${occupied.vehicleNumber} must check out before it can be removed.`);
  }

  if (removable.length > 0) {
    await manager.remove(VisitorVehicleSchema, removable);
  }
  if (existingRows.length > 0) {
    await manager.save(VisitorVehicleSchema, existingRows);
  }
  if (newRows.length > 0) {
    await manager.save(VisitorVehicleSchema, newRows);
  }

  return getVisitorVehicles(manager, visitor.id);
}

async function loadVisitorWithRelations(manager: EntityManager, visitorId: string) {
  return manager.findOneOrFail(VisitorSchema, {
    where: { id: visitorId },
    relations: { type: true, vehicles: true },
  });
}

async function refreshVisitorAggregate(manager: EntityManager, visitor: VisitorEntity) {
  const vehicles = await getVisitorVehicles(manager, visitor.id);
  if (visitor.status === "cancelled") {
    return loadVisitorWithRelations(manager, visitor.id);
  }

  const checkedInVehicles = vehicles.filter((vehicle) => vehicle.status === "checked_in");
  const checkedOutVehicles = vehicles.filter((vehicle) => vehicle.status === "checked_out");
  const terminalVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "checked_out" || vehicle.status === "cancelled" || vehicle.status === "rejected",
  );
  const allFinished = vehicles.length > 0 && checkedOutVehicles.length === vehicles.length;
  const allClosed = vehicles.length > 0 && terminalVehicles.length === vehicles.length;
  const firstCheckIn = [...checkedInVehicles, ...checkedOutVehicles]
    .map((vehicle) => vehicle.checkedIn)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastCheckOut = checkedOutVehicles
    .map((vehicle) => vehicle.checkedOut)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (checkedInVehicles.length > 0) {
    visitor.checkedIn = firstCheckIn;
    visitor.checkedOut = null;
    visitor.checkedInBy =
      vehicles.find((vehicle) => vehicle.checkedIn?.getTime() === firstCheckIn?.getTime())?.checkedInBy ?? visitor.checkedInBy;
    visitor.checkedOutBy = null;
    visitor.status = "checked_in";
  } else if (allFinished) {
    visitor.checkedIn = firstCheckIn;
    visitor.checkedOut = lastCheckOut;
    visitor.checkedInBy =
      vehicles.find((vehicle) => vehicle.checkedIn?.getTime() === firstCheckIn?.getTime())?.checkedInBy ?? visitor.checkedInBy;
    visitor.checkedOutBy =
      vehicles.find((vehicle) => vehicle.checkedOut?.getTime() === lastCheckOut?.getTime())?.checkedOutBy ?? visitor.checkedOutBy;
    visitor.status = "checked_out";
  } else if (allClosed) {
    visitor.checkedIn = firstCheckIn;
    visitor.checkedOut = lastCheckOut;
    visitor.checkedInBy = firstCheckIn
      ? vehicles.find((vehicle) => vehicle.checkedIn?.getTime() === firstCheckIn.getTime())?.checkedInBy ?? visitor.checkedInBy
      : null;
    visitor.checkedOutBy = lastCheckOut
      ? vehicles.find((vehicle) => vehicle.checkedOut?.getTime() === lastCheckOut.getTime())?.checkedOutBy ?? visitor.checkedOutBy
      : null;
    visitor.status = checkedOutVehicles.length > 0 ? "checked_out" : "pending";
  } else {
    visitor.checkedIn = null;
    visitor.checkedOut = null;
    visitor.checkedInBy = null;
    visitor.checkedOutBy = null;
    visitor.status = "pending";
  }

  await manager.save(VisitorSchema, visitor);
  return loadVisitorWithRelations(manager, visitor.id);
}

function findVehicleByNumber(vehicles: VisitorVehicleEntity[], vehicleNumber: string | undefined) {
  const normalised = normalisePlate(vehicleNumber ?? "");
  if (!normalised) return null;
  return vehicles.find((vehicle) => vehicle.vehicleNumberNormalised === normalised) ?? null;
}

function chooseVehicleForScan(
  vehicles: VisitorVehicleEntity[],
  action: ScanAction,
  vehicleNumber: string | undefined,
) {
  const requested = findVehicleByNumber(vehicles, vehicleNumber);
  if (vehicleNumber && !requested) {
    throw new Error("Vehicle is not part of this registration.");
  }

  if (action === "check_in") {
    return requested ?? vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0] ?? null;
  }

  if (action === "check_out") {
    if (requested) return requested;
    const active = vehicles.filter((vehicle) => vehicle.status === "checked_in");
    if (active.length === 1) return active[0];
    if (active.length > 1) throw new Error("Select a vehicle to check out.");
    return vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0] ?? null;
  }

  if (requested) {
    return requested;
  }

  const primary = vehicles.find((vehicle) => vehicle.isPrimary);
  if (primary?.status === "pending" || primary?.status === "checked_in") return primary;
  return vehicles.find((vehicle) => vehicle.status === "checked_in") ?? vehicles.find((vehicle) => vehicle.status === "pending") ?? primary ?? null;
}

async function assertNoActiveVehicleConflict(
  manager: EntityManager,
  vehicleNumberNormalised: string,
  currentVehicleId: string,
) {
  const conflict = await manager.findOne(VisitorVehicleSchema, {
    where: {
      vehicleNumberNormalised,
      status: "checked_in",
    },
  });
  if (conflict && conflict.id !== currentVehicleId) {
    throw new Error("Vehicle is already checked in under another active visit.");
  }
}

function assertVehicleCanTransition(vehicle: VisitorVehicleEntity, action: ScanAction, now: Date) {
  if (vehicle.status === "cancelled") {
    throw new Error("Visitor pass has been cancelled.");
  }
  if (vehicle.status === "rejected") {
    throw new Error("Vehicle arrival has already been rejected.");
  }
  if (vehicle.status === "checked_out") {
    throw new Error("Vehicle has already checked out.");
  }
  if (action === "check_out" && vehicle.status === "pending") {
    throw new Error("Vehicle must check in before check-out.");
  }
  if (action === "check_in" && vehicle.status === "checked_in") {
    throw new Error("Vehicle has already checked in.");
  }
  if (action === "auto" && vehicle.status === "pending") return "check_in" as const;
  if (action === "auto" && vehicle.status === "checked_in") return "check_out" as const;
  if (action === "check_in" && vehicle.status === "pending") return "check_in" as const;
  if (action === "check_out" && vehicle.status === "checked_in") {
    if (!vehicle.checkedIn) {
      throw new Error("Vehicle check-in timestamp is missing.");
    }
    if (vehicle.checkedIn > now) {
      throw new Error("Check-out time cannot be before check-in time.");
    }
    return "check_out" as const;
  }
  throw new Error("Visitor pass cannot be scanned in its current state.");
}

function setChangedValue(
  changes: Record<string, VisitorDetailsChange>,
  field: string,
  current: string | number | null,
  next: string | number | null,
  apply: () => void,
) {
  if (current === next) return;
  changes[field] = { from: current, to: next };
  apply();
}

async function applyVisitorDetailsUpdate(
  manager: EntityManager,
  visitor: VisitorEntity,
  details: VisitorDetailsUpdateInput | undefined,
  guardId: string | undefined,
) {
  if (!details) return;

  const changes: Record<string, VisitorDetailsChange> = {};

  if (details.name !== undefined) {
    const next = details.name.trim();
    if (!next) throw new Error("Visitor name is required.");
    setChangedValue(changes, "name", visitor.name, next, () => {
      visitor.name = next;
    });
  }

  if (details.phoneNumber !== undefined) {
    const next = details.phoneNumber.trim();
    if (!next) throw new Error("Contact number is required.");
    setChangedValue(changes, "phoneNumber", visitor.phoneNumber, next, () => {
      visitor.phoneNumber = next;
    });
  }

  if (details.organisation !== undefined) {
    const next = normaliseNullable(details.organisation);
    setChangedValue(changes, "organisation", visitor.organisation, next, () => {
      visitor.organisation = next;
    });
  }

  if (details.identityType !== undefined || details.nric !== undefined || details.passportNumber !== undefined) {
    const next = normaliseIdentityDocument({
      identityType: details.identityType ?? visitor.identityType,
      nric: details.nric ?? visitor.nric,
      passportNumber: details.passportNumber ?? visitor.passportNumber,
    });
    setChangedValue(changes, "identityType", visitor.identityType, next.identityType, () => {
      visitor.identityType = next.identityType;
    });
    setChangedValue(changes, "nric", visitor.nric, next.nric, () => {
      visitor.nric = next.nric;
    });
    setChangedValue(changes, "passportNumber", visitor.passportNumber, next.passportNumber, () => {
      visitor.passportNumber = next.passportNumber;
    });
  }

  if (details.vehicleNumber !== undefined) {
    const next = details.vehicleNumber.trim().toUpperCase();
    if (!next) throw new Error("Vehicle number is required.");
    setChangedValue(changes, "vehicleNumber", visitor.vehicleNumber, next, () => {
      visitor.vehicleNumber = next;
      visitor.vehicleNumberNormalised = normalisePlate(next);
      visitor.additionalVehicleNumbers = parseAdditionalVehicleNumbers(visitor.additionalVehicleNumbers, next);
    });
  }

  if (details.additionalVehicleNumbers !== undefined) {
    const next = parseAdditionalVehicleNumbers(details.additionalVehicleNumbers, visitor.vehicleNumber);
    const current = visitor.additionalVehicleNumbers ?? [];
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      changes.additionalVehicleNumbers = { from: current.join(", ") || null, to: next.join(", ") || null };
      visitor.additionalVehicleNumbers = next;
    }
  }

  if (details.typeCode !== undefined) {
    const typeCode = assertVisitorTypeCode(details.typeCode);
    const type = await getVisitorTypeByCodeOrThrow(manager, typeCode);
    setChangedValue(changes, "typeId", visitor.typeId, type.id, () => {
      visitor.typeId = type.id;
      visitor.type = type;
    });
  }

  if (details.purpose !== undefined) {
    const next = assertPurpose(details.purpose);
    setChangedValue(changes, "purpose", visitor.purpose, next, () => {
      visitor.purpose = next;
    });
  }

  if (details.visitTime !== undefined) {
    const next = normaliseVisitTime(details.visitTime);
    setChangedValue(changes, "visitTime", visitor.visitTime, next, () => {
      visitor.visitTime = next;
    });
  }

  if (details.visitorCount !== undefined) {
    const next = normaliseVisitorCount(details.visitorCount);
    setChangedValue(changes, "visitorCount", visitor.visitorCount, next, () => {
      visitor.visitorCount = next;
    });
  }

  if (details.remarks !== undefined) {
    const next = normaliseNullable(details.remarks);
    setChangedValue(changes, "remarks", visitor.remarks, next, () => {
      visitor.remarks = next;
    });
  }

  assertRemarksForOther(visitor.type?.code ?? "", visitor.purpose, visitor.remarks);

  if (details.hostStaffId !== undefined) {
    const next = normaliseNullable(details.hostStaffId);
    setChangedValue(changes, "hostStaffId", visitor.hostStaffId, next, () => {
      visitor.hostStaffId = next;
    });
  }

  if (details.hostDepartment !== undefined) {
    const next = normaliseNullable(details.hostDepartment);
    setChangedValue(changes, "hostDepartment", visitor.hostDepartment, next, () => {
      visitor.hostDepartment = next;
    });
  }

  if (details.flagReason !== undefined) {
    const next = normaliseNullable(details.flagReason);
    setChangedValue(changes, "flagReason", visitor.flagReason, next, () => {
      visitor.flagReason = next;
    });
  }

  if (Object.keys(changes).length === 0) return;

  const identityChanges = pickIdentityDetailChanges(changes);
  const identityAudit = Object.keys(identityChanges).length > 0
    ? {
        changedBy: guardId?.trim() || null,
        changedAt: new Date().toISOString(),
        changes: identityChanges,
      }
    : undefined;

  await manager.save(VisitorSchema, visitor);
  await syncVisitorVehicleRoster(manager, visitor);
  await manager.insert(VisitorScanEventSchema, {
    visitorId: visitor.id,
    eventType: "details_updated",
    guardId: guardId?.trim() || null,
    metadata: {
      reason: "arrival_manual_verification",
      changes,
      ...(identityAudit ? { identityDocument: identityAudit } : {}),
    },
  });
}

export function assertVisitDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Visit date must use YYYY-MM-DD format.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Visit date is invalid.");
  }

  return value;
}

export function normaliseVisitTime(value: unknown): string | null {
  const time = String(value ?? "").trim();
  if (!time) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Visit time must use HH:mm format.");
  }
  const [hour, minute] = time.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Visit time is invalid.");
  }
  return time;
}

export function normaliseVisitorCount(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    throw new Error("Number of visitors must be between 1 and 999.");
  }
  return count;
}

export function assertVisitorTypeCode(value: unknown): VisitorTypeCode {
  if (
    value === "visitor" ||
    value === "vendor" ||
    value === "courier" ||
    value === "patient" ||
    value === "staff" ||
    value === "contractor" ||
    value === "vip" ||
    value === "other"
  ) {
    return value;
  }

  throw new Error("Invalid visitor type.");
}

export async function createVisitorPass(input: CreateVisitorInput): Promise<IssuedVisitorPass> {
  assertQrSigningConfigured();
  const ds = await getParkingDataSource();
  const tokenId = crypto.randomUUID();
  const tokenIssuedAt = new Date();
  const visitDate = input.visitDate ? assertVisitDate(input.visitDate) : null;
  const visitTime = normaliseVisitTime(input.visitTime);
  const visitorCount = normaliseVisitorCount(input.visitorCount);
  const tokenExpiresAt = visitDate
    ? getPreRegistrationTokenExpiresAt(visitDate)
    : getVisitTokenExpiresAt(tokenIssuedAt);

  if (tokenExpiresAt <= tokenIssuedAt) {
    throw new Error("Visit date must be today or later.");
  }

  const visitor = await ds.transaction(async (manager) => {
    const type = await getVisitorTypeByCodeOrThrow(manager, input.typeCode);
    const remarks = input.remarks?.trim() || null;
    const purpose = assertPurpose(input.purpose);
    const identity = normaliseIdentityDocument({ ...input, required: true });
    assertRemarksForOther(input.typeCode, purpose, remarks);
    const checkedInAt = input.checkInOnCreate ? new Date() : null;
    const created = manager.create(VisitorSchema, {
      name: input.name.trim(),
      phoneNumber: input.phoneNumber.trim(),
      organisation: input.organisation?.trim() || null,
      identityType: identity.identityType,
      nric: identity.nric,
      passportNumber: identity.passportNumber,
      vehicleNumber: input.vehicleNumber.trim().toUpperCase(),
      vehicleNumberNormalised: normalisePlate(input.vehicleNumber),
      additionalVehicleNumbers: parseAdditionalVehicleNumbers(input.additionalVehicleNumbers, input.vehicleNumber),
      checkedIn: checkedInAt,
      typeId: type.id,
      type,
      purpose,
      visitDate,
      visitTime,
      visitorCount,
      remarks,
      hostStaffId: input.hostStaffId?.trim() || null,
      hostDepartment: input.hostDepartment?.trim() || null,
      flagReason: input.flagReason?.trim() || null,
      qrTokenJti: tokenId,
      status: checkedInAt ? "checked_in" : "pending",
      createdBy: input.guardId?.trim() || null,
      checkedInBy: checkedInAt ? input.guardId?.trim() || null : null,
    });

    const saved = await manager.save(VisitorSchema, created);
    await syncVisitorVehicleRoster(manager, saved);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: saved.id,
      eventType: "pass_issued",
      guardId: input.guardId?.trim() || null,
      metadata: {
        vehicleNumber: saved.vehicleNumber,
        additionalVehicleNumbers: saved.additionalVehicleNumbers ?? [],
        ...(saved.visitTime ? { visitTime: saved.visitTime } : {}),
        ...(saved.visitorCount ? { visitorCount: saved.visitorCount } : {}),
      },
    });

    if (checkedInAt) {
      const vehicles = await getVisitorVehicles(manager, saved.id);
      const primary = vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
      if (primary) {
        await assertNoActiveVehicleConflict(manager, primary.vehicleNumberNormalised, primary.id);
        primary.status = "checked_in";
        primary.checkedIn = checkedInAt;
        primary.checkedOut = null;
        primary.checkedInBy = input.guardId?.trim() || null;
        await manager.save(VisitorVehicleSchema, primary);
      }
      await manager.insert(VisitorScanEventSchema, {
        visitorId: saved.id,
        eventType: "check_in",
        guardId: input.guardId?.trim() || null,
        metadata: { vehicleNumber: saved.vehicleNumber },
      });
      await refreshVisitorAggregate(manager, saved);
    }

    return loadVisitorWithRelations(manager, saved.id);
  });

  return {
    visitor: await hydrateVisitorHost(toDto(visitor)),
    token: await signVisitToken(visitor.id, tokenId, tokenIssuedAt, tokenExpiresAt),
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  };
}

export async function getPublicVisitorPass(token: string): Promise<PublicVisitorPass> {
  let claims;
  try {
    claims = await resolveVisitTokenReference(token);
  } catch {
    return {
      state: "inactive",
      title: "Pass expired",
      message: "This visitor pass is expired or invalid. Please request a new pass from the guard.",
    };
  }

  const ds = await getParkingDataSource();
  const visitors = (await ds.manager.query(
    `
      SELECT
        "id",
        "qr_token_jti" AS "qrTokenJti",
        "status",
        "visit_date"::text AS "visitDate",
        "created_at" AS "createdAt"
      FROM "parking"."visitors"
      WHERE "id" = $1
      LIMIT 1
    `,
    [claims.visitId],
  )) as PublicPassVisitorRow[];
  const visitor = visitors[0];

  if (!visitor || !isVisitorTokenMatch(visitor, claims)) {
    return {
      state: "inactive",
      title: "Pass unavailable",
      message: "This visitor pass is no longer valid. Please contact the guard desk.",
    };
  }

  if (visitor.status === "checked_out") {
    return {
      state: "inactive",
      title: "Pass already used",
      message: "This visit has already been checked out. The QR code is no longer available.",
    };
  }

  if (visitor.status === "cancelled") {
    return {
      state: "inactive",
      title: "Pass cancelled",
      message: "This visitor pass has been cancelled. Please contact the guard desk.",
    };
  }

  const policyExpiresAt = getVisitorPolicyExpiresAt(visitor, claims);
  if (visitor.status === "pending" && policyExpiresAt <= new Date()) {
    return {
      state: "inactive",
      title: "Pass expired",
      message: "This visitor pass has expired. Please request a new pass from the guard.",
    };
  }

  return {
    state: "active",
    token,
    status: visitor.status,
    heading: visitor.status === "pending" ? "Scan at gate to check in" : "Keep for exit scan",
    message:
      visitor.status === "pending"
        ? "Save or screenshot this code and show it to the guard when you arrive."
        : "Show this pass to the guard when you leave.",
    validUntil: policyExpiresAt.toISOString(),
  };
}

type VisitorPassRejection = {
  visitorId?: string;
  reason:
    | "visitor_not_found"
    | "token_mismatch"
    | "token_expired"
    | "pass_cancelled"
    | "no_vehicle_checked_in"
    | "already_checked_in"
    | "already_checked_out";
  message: string;
};

async function recordRejectedScan(
  ds: Awaited<ReturnType<typeof getParkingDataSource>>,
  rejected: VisitorPassRejection,
  guardId: string | undefined,
  metadata: Record<string, unknown> = {},
) {
  await ds.manager.insert(VisitorScanEventSchema, {
    visitorId: rejected.visitorId,
    eventType: "scan_rejected",
    guardId: guardId?.trim() || null,
    metadata: { reason: rejected.reason, ...metadata },
  });
}

function getArrivalReviewRejection(
  visitor: VisitorEntity,
  vehicles: VisitorVehicleEntity[],
  policyExpiresAt: Date,
  now: Date,
): VisitorPassRejection | null {
  if (visitor.status === "cancelled") {
    return {
      visitorId: visitor.id,
      reason: "pass_cancelled",
      message: "Visitor pass has been cancelled.",
    };
  }

  const hasPendingArrival = vehicles.some((vehicle) => vehicle.status === "pending");

  if (visitor.status === "checked_in" && !hasPendingArrival) {
    return {
      visitorId: visitor.id,
      reason: "already_checked_in",
      message: "All registered vehicles have already checked in or been closed.",
    };
  }

  if (visitor.status === "checked_out") {
    return {
      visitorId: visitor.id,
      reason: "already_checked_out",
      message: "Visitor has already checked out.",
    };
  }

  if (policyExpiresAt <= now) {
    return {
      visitorId: visitor.id,
      reason: "token_expired",
      message: "Visitor pass has expired.",
    };
  }

  return null;
}

export async function reviewVisitorPass(input: ReviewVisitorPassInput): Promise<VisitorDto> {
  const claims = await resolveVisitTokenReference(input.token);
  const ds = await getParkingDataSource();

  const result = await ds.transaction<
    | { visitor: VisitorDto }
    | { rejected: VisitorPassRejection }
  >(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: claims.visitId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      return {
        rejected: {
          reason: "visitor_not_found",
          message: "Visitor pass not found.",
        },
      };
    }

    if (!isVisitorTokenMatch(visitor, claims)) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_mismatch",
          message: "Visitor pass is not valid for this record.",
        },
      };
    }

    const vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    const rejection = getArrivalReviewRejection(visitor, vehicles, getVisitorPolicyExpiresAt(visitor, claims), new Date());
    if (rejection) return { rejected: rejection };

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_reviewed",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: "arrival_manual_verification" },
    });

    const refreshed = await loadVisitorWithRelations(manager, visitor.id);

    return { visitor: toDto(refreshed) };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return hydrateVisitorHost(result.visitor);
}

export async function reviewVisitorPassForExit(input: ReviewVisitorPassInput): Promise<VisitorDto> {
  const claims = await resolveVisitTokenReference(input.token);
  const ds = await getParkingDataSource();

  const result = await ds.transaction<
    | { visitor: VisitorDto }
    | { rejected: VisitorPassRejection }
  >(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: claims.visitId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      return {
        rejected: {
          reason: "visitor_not_found",
          message: "Visitor pass not found.",
        },
      };
    }

    if (!isVisitorTokenMatch(visitor, claims)) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_mismatch",
          message: "Visitor pass is not valid for this record.",
        },
      };
    }

    if (visitor.status === "cancelled") {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "pass_cancelled",
          message: "Visitor pass has been cancelled.",
        },
      };
    }

    const vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "checked_in");
    if (activeVehicles.length === 0) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: vehicles.every((vehicle) => vehicle.status === "checked_out") ? "already_checked_out" : "no_vehicle_checked_in",
          message: vehicles.every((vehicle) => vehicle.status === "checked_out")
            ? "Visitor has already checked out."
            : "No linked vehicle is currently checked in.",
        },
      };
    }

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_reviewed",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: "exit_vehicle_selection" },
    });

    const refreshed = await loadVisitorWithRelations(manager, visitor.id);
    return { visitor: toDto(refreshed) };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return hydrateVisitorHost(result.visitor);
}

export async function rejectVisitorPassScan(input: RejectVisitorPassInput): Promise<VisitorDto> {
  const claims = await resolveVisitTokenReference(input.token);
  const ds = await getParkingDataSource();
  const manualReason = input.reason?.trim() || "Rejected during arrival manual verification.";

  const result = await ds.transaction<
    | { visitor: VisitorDto; visitorId: string }
    | { rejected: VisitorPassRejection }
  >(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: claims.visitId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      return {
        rejected: {
          reason: "visitor_not_found",
          message: "Visitor pass not found.",
        },
      };
    }

    if (!isVisitorTokenMatch(visitor, claims)) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_mismatch",
          message: "Visitor pass is not valid for this record.",
        },
      };
    }

    const vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    const rejection = getArrivalReviewRejection(visitor, vehicles, getVisitorPolicyExpiresAt(visitor, claims), new Date());
    if (rejection) return { rejected: rejection };

    const vehicle = chooseVehicleForScan(vehicles, "check_in", input.vehicleNumber);
    if (!vehicle) {
      throw new Error("No matching vehicle is available for rejection.");
    }
    if (vehicle.status === "checked_in") {
      throw new Error("Vehicle has already checked in.");
    }
    if (vehicle.status === "checked_out") {
      throw new Error("Vehicle has already checked out.");
    }
    if (vehicle.status === "cancelled") {
      throw new Error("Visitor pass has been cancelled.");
    }
    if (vehicle.status === "rejected") {
      throw new Error("Vehicle arrival has already been rejected.");
    }

    vehicle.status = "rejected";
    vehicle.checkedIn = null;
    vehicle.checkedOut = null;
    vehicle.checkedInBy = null;
    vehicle.checkedOutBy = null;
    await manager.save(VisitorVehicleSchema, vehicle);
    const refreshedVisitor = await refreshVisitorAggregate(manager, visitor);

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_rejected",
      guardId: input.guardId?.trim() || null,
      metadata: {
        reason: "manual_rejection",
        manualReason,
        vehicleNumber: vehicle.vehicleNumber,
      },
    });

    return { visitor: toDto(refreshedVisitor), visitorId: visitor.id };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return hydrateVisitorHost(result.visitor);
}

export async function scanVisitorPass(input: ScanVisitorInput): Promise<VisitorDto> {
  const claims = await resolveVisitTokenReference(input.token);
  const ds = await getParkingDataSource();

  const result = await ds.transaction<
    | { visitor: VisitorDto }
    | { rejected: VisitorPassRejection }
  >(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: claims.visitId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      return {
        rejected: {
          reason: "visitor_not_found",
          message: "Visitor pass not found.",
        },
      };
    }

    if (!isVisitorTokenMatch(visitor, claims)) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_mismatch",
          message: "Visitor pass is not valid for this record.",
        },
      };
    }

    const action = assertScanAction(input.action);
    const now = new Date();
    const policyExpiresAt = getVisitorPolicyExpiresAt(visitor, claims);
    if (visitor.status === "pending" && policyExpiresAt <= now) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_expired",
          message: "Visitor pass has expired.",
        },
      };
    }

    if (action === "check_in" || action === "auto") {
      await applyVisitorDetailsUpdate(manager, visitor, input.details, input.guardId);
    }

    let vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    if (input.details) {
      vehicles = await getVisitorVehicles(manager, visitor.id);
    }

    const vehicle = chooseVehicleForScan(vehicles, action, input.vehicleNumber);
    if (!vehicle) {
      throw new Error("No matching vehicle is available for this scan.");
    }

    const transition = assertVehicleCanTransition(vehicle, action, now);
    if (transition === "check_in" && policyExpiresAt <= now) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_expired",
          message: "Visitor pass has expired.",
        },
      };
    }
    if (transition === "check_in") {
      await assertNoActiveVehicleConflict(manager, vehicle.vehicleNumberNormalised, vehicle.id);
      vehicle.status = "checked_in";
      vehicle.checkedIn = now;
      vehicle.checkedOut = null;
      vehicle.checkedInBy = input.guardId?.trim() || null;
      vehicle.checkedOutBy = null;
    } else {
      vehicle.status = "checked_out";
      vehicle.checkedOut = now;
      vehicle.checkedOutBy = input.guardId?.trim() || null;
    }

    await manager.save(VisitorVehicleSchema, vehicle);
    const refreshedVisitor = await refreshVisitorAggregate(manager, visitor);

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: transition,
      guardId: input.guardId?.trim() || null,
      metadata: { vehicleNumber: vehicle.vehicleNumber },
    });

    return { visitor: toDto(refreshedVisitor) };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return hydrateVisitorHost(result.visitor);
}

export async function cancelPendingVisitorPass(input: CancelVisitorInput): Promise<VisitorDto> {
  const ds = await getParkingDataSource();

  const visitor = await ds.transaction(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: input.visitorId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      throw new Error("Visitor pass not found.");
    }

    if (visitor.status !== "pending" || visitor.checkedIn || visitor.checkedOut) {
      throw new Error("Only pending visitor passes can be cancelled.");
    }

    visitor.status = "cancelled";
    visitor.qrTokenJti = null;
    visitor.vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    for (const vehicle of visitor.vehicles) {
      vehicle.status = "cancelled";
    }
    await manager.save(VisitorVehicleSchema, visitor.vehicles);
    await manager.save(VisitorSchema, visitor);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "pass_cancelled",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: "pending_visit_cancelled" },
    });

    const refreshed = await loadVisitorWithRelations(manager, visitor.id);

    return toDto(refreshed);
  });

  return hydrateVisitorHost(visitor);
}

export async function checkOutVisitorById(input: CheckOutVisitorInput): Promise<VisitorDto> {
  const ds = await getParkingDataSource();

  const visitor = await ds.transaction(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: input.visitorId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      throw new Error("Visitor pass not found.");
    }

    const now = new Date();
    const vehicles = await ensureVisitorVehicleRoster(manager, visitor);
    const vehicle = chooseVehicleForScan(vehicles, "check_out", input.vehicleNumber);
    if (!vehicle) {
      throw new Error("No matching vehicle is available for check-out.");
    }
    assertVehicleCanTransition(vehicle, "check_out", now);
    vehicle.status = "checked_out";
    vehicle.checkedOut = now;
    vehicle.checkedOutBy = input.guardId?.trim() || null;
    await manager.save(VisitorVehicleSchema, vehicle);
    const refreshedVisitor = await refreshVisitorAggregate(manager, visitor);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "check_out",
      guardId: input.guardId?.trim() || null,
      metadata: { vehicleNumber: vehicle.vehicleNumber },
    });

    return toDto(refreshedVisitor);
  });

  return hydrateVisitorHost(visitor);
}
