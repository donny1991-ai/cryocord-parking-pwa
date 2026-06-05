import "server-only";
import { VisitorScanEventSchema, VisitorSchema, VisitorTypeSchema } from "@/db/entities";
import type { VisitorEntity, VisitorStatus } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { PURPOSES, type Purpose } from "@/lib/enums";
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
import { assertScanAction, resolveVisitorScanTransition, type ScanAction } from "./visitor-state";
import type { EntityManager } from "typeorm";

export type VisitorTypeCode =
  | "visitor"
  | "vendor"
  | "courier"
  | "patient"
  | "staff"
  | "contractor"
  | "vip"
  | "other";
export type { ScanAction } from "./visitor-state";

export interface CreateVisitorInput {
  name: string;
  phoneNumber: string;
  organisation?: string;
  vehicleNumber: string;
  typeCode: VisitorTypeCode;
  purpose?: Purpose;
  visitDate?: string;
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
  guardId?: string;
  details?: VisitorDetailsUpdateInput;
}

export interface CheckOutVisitorInput {
  visitorId: string;
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
  guardId?: string;
  reason?: string;
}

export interface VisitorDetailsUpdateInput {
  name?: string;
  phoneNumber?: string;
  organisation?: string | null;
  vehicleNumber?: string;
  typeCode?: VisitorTypeCode;
  purpose?: Purpose;
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
  vehicleNumber: string;
  checkedIn: string | null;
  checkedOut: string | null;
  typeCode: string;
  typeLabel: string;
  remarks: string | null;
  purpose: string;
  hostStaffId: string | null;
  hostDepartment: string | null;
  flagReason: string | null;
  status: VisitorStatus;
  createdAt: string;
  updatedAt: string;
}

type ResolvedPassClaims = PassClaims & {
  verified: boolean;
};

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

function toDto(visitor: VisitorEntity): VisitorDto {
  return {
    id: visitor.id,
    name: visitor.name,
    phoneNumber: visitor.phoneNumber,
    organisation: visitor.organisation,
    vehicleNumber: visitor.vehicleNumber,
    checkedIn: visitor.checkedIn?.toISOString() ?? null,
    checkedOut: visitor.checkedOut?.toISOString() ?? null,
    typeCode: visitor.type?.code ?? String(visitor.typeId),
    typeLabel: visitor.type?.label ?? "Unknown",
    remarks: visitor.remarks,
    purpose: visitor.purpose,
    hostStaffId: visitor.hostStaffId,
    hostDepartment: visitor.hostDepartment,
    flagReason: visitor.flagReason,
    status: visitor.status,
    createdAt: visitor.createdAt.toISOString(),
    updatedAt: visitor.updatedAt.toISOString(),
  };
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

function requiresRemarks(typeCode: VisitorTypeCode, purpose: Purpose) {
  return typeCode === "other" || purpose === "other";
}

function assertRequiredRemarks(typeCode: VisitorTypeCode, purpose: Purpose, remarks: string | null | undefined) {
  if (requiresRemarks(typeCode, purpose) && !remarks?.trim()) {
    throw new Error("Notes are required when visit type or purpose is Other.");
  }
}

async function getVisitorTypeByCodeOrThrow(manager: EntityManager, code: VisitorTypeCode) {
  const type = await manager.findOneBy(VisitorTypeSchema, { code });
  if (!type) {
    throw new Error(`Visitor type reference data is missing for "${code}". Run database migrations.`);
  }
  return type;
}

function getVisitorPolicyExpiresAt(visitor: Pick<VisitorEntity, "visitDate" | "createdAt">, fallbackExpiresAt?: string) {
  if (visitor.visitDate) {
    return getPreRegistrationTokenExpiresAt(visitor.visitDate);
  }
  return fallbackExpiresAt ? new Date(fallbackExpiresAt) : getVisitTokenExpiresAt(visitor.createdAt);
}

async function resolveVisitTokenReference(token: string): Promise<ResolvedPassClaims> {
  try {
    return {
      ...(await verifyVisitToken(token, { ignoreExpiration: true })),
      verified: true,
    };
  } catch {
    return {
      ...decodeVisitTokenReference(token),
      verified: false,
    };
  }
}

function isVisitorTokenMatch(visitor: VisitorEntity, claims: ResolvedPassClaims) {
  if (visitor.qrTokenJti) {
    return claims.tokenId === visitor.qrTokenJti;
  }

  return claims.verified;
}

type VisitorDetailsChange = {
  from: string | number | null;
  to: string | number | null;
};

function normaliseNullable(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
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

  if (details.vehicleNumber !== undefined) {
    const next = details.vehicleNumber.trim().toUpperCase();
    if (!next) throw new Error("Vehicle number is required.");
    setChangedValue(changes, "vehicleNumber", visitor.vehicleNumber, next, () => {
      visitor.vehicleNumber = next;
      visitor.vehicleNumberNormalised = normalisePlate(next);
    });
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

  if (details.remarks !== undefined) {
    const next = normaliseNullable(details.remarks);
    setChangedValue(changes, "remarks", visitor.remarks, next, () => {
      visitor.remarks = next;
    });
  }

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

  const finalTypeCode =
    details.typeCode ??
    ((await manager.findOneByOrFail(VisitorTypeSchema, { id: visitor.typeId })).code as VisitorTypeCode);
  assertRequiredRemarks(finalTypeCode, assertPurpose(visitor.purpose), visitor.remarks);

  if (Object.keys(changes).length === 0) return;

  await manager.save(VisitorSchema, visitor);
  await manager.insert(VisitorScanEventSchema, {
    visitorId: visitor.id,
    eventType: "details_updated",
    guardId: guardId?.trim() || null,
    metadata: {
      reason: "arrival_manual_verification",
      changes,
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
    assertRequiredRemarks(input.typeCode, purpose, remarks);
    const checkedInAt = input.checkInOnCreate ? new Date() : null;
    const created = manager.create(VisitorSchema, {
      name: input.name.trim(),
      phoneNumber: input.phoneNumber.trim(),
      organisation: input.organisation?.trim() || null,
      vehicleNumber: input.vehicleNumber.trim().toUpperCase(),
      vehicleNumberNormalised: normalisePlate(input.vehicleNumber),
      checkedIn: checkedInAt,
      typeId: type.id,
      type,
      purpose,
      visitDate,
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
    await manager.insert(VisitorScanEventSchema, {
      visitorId: saved.id,
      eventType: "pass_issued",
      guardId: input.guardId?.trim() || null,
      metadata: { vehicleNumber: saved.vehicleNumber },
    });

    if (checkedInAt) {
      await manager.insert(VisitorScanEventSchema, {
        visitorId: saved.id,
        eventType: "check_in",
        guardId: input.guardId?.trim() || null,
      });
    }

    return manager.findOneOrFail(VisitorSchema, {
      where: { id: saved.id },
      relations: { type: true },
    });
  });

  return {
    visitor: toDto(visitor),
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
  const visitor = await ds.manager.findOneBy(VisitorSchema, { id: claims.visitId });

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

  const policyExpiresAt = getVisitorPolicyExpiresAt(visitor, claims.expiresAt);
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

  if (visitor.status === "checked_in") {
    return {
      visitorId: visitor.id,
      reason: "already_checked_in",
      message: "Visitor has already checked in.",
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

    const rejection = getArrivalReviewRejection(visitor, getVisitorPolicyExpiresAt(visitor, claims.expiresAt), new Date());
    if (rejection) return { rejected: rejection };

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_reviewed",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: "arrival_manual_verification" },
    });

    const refreshed = await manager.findOneOrFail(VisitorSchema, {
      where: { id: visitor.id },
      relations: { type: true },
    });

    return { visitor: toDto(refreshed) };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return result.visitor;
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

    const rejection = getArrivalReviewRejection(visitor, getVisitorPolicyExpiresAt(visitor, claims.expiresAt), new Date());
    if (rejection) return { rejected: rejection };

    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_rejected",
      guardId: input.guardId?.trim() || null,
      metadata: {
        reason: "manual_rejection",
        manualReason,
      },
    });

    const refreshed = await manager.findOneOrFail(VisitorSchema, {
      where: { id: visitor.id },
      relations: { type: true },
    });

    return { visitor: toDto(refreshed), visitorId: visitor.id };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return result.visitor;
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
    const policyExpiresAt = getVisitorPolicyExpiresAt(visitor, claims.expiresAt);
    if (visitor.status === "pending" && policyExpiresAt <= now) {
      return {
        rejected: {
          visitorId: visitor.id,
          reason: "token_expired",
          message: "Visitor pass has expired.",
        },
      };
    }

    const transition = resolveVisitorScanTransition(visitor, action, now);

    if (transition.eventType === "check_in") {
      await applyVisitorDetailsUpdate(manager, visitor, input.details, input.guardId);
    }

    if (transition.eventType === "check_in") {
      visitor.checkedIn = transition.checkedIn;
      visitor.checkedOut = transition.checkedOut;
      visitor.checkedInBy = input.guardId?.trim() || null;
    } else {
      visitor.checkedIn = transition.checkedIn;
      visitor.checkedOut = transition.checkedOut;
      visitor.checkedOutBy = input.guardId?.trim() || null;
    }

    visitor.status = transition.status;
    await manager.save(VisitorSchema, visitor);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: transition.eventType,
      guardId: input.guardId?.trim() || null,
    });

    const refreshed = await manager.findOneOrFail(VisitorSchema, {
      where: { id: visitor.id },
      relations: { type: true },
    });

    return { visitor: toDto(refreshed) };
  });

  if ("rejected" in result) {
    await recordRejectedScan(ds, result.rejected, input.guardId);
    throw new Error(result.rejected.message);
  }

  return result.visitor;
}

export async function cancelPendingVisitorPass(input: CancelVisitorInput): Promise<VisitorDto> {
  const ds = await getParkingDataSource();

  return ds.transaction(async (manager) => {
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
    await manager.save(VisitorSchema, visitor);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "pass_cancelled",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: "pending_visit_cancelled" },
    });

    const refreshed = await manager.findOneOrFail(VisitorSchema, {
      where: { id: visitor.id },
      relations: { type: true },
    });

    return toDto(refreshed);
  });
}

export async function checkOutVisitorById(input: CheckOutVisitorInput): Promise<VisitorDto> {
  const ds = await getParkingDataSource();

  return ds.transaction(async (manager) => {
    const visitor = await manager.findOne(VisitorSchema, {
      where: { id: input.visitorId },
      lock: { mode: "pessimistic_write" },
    });

    if (!visitor) {
      throw new Error("Visitor pass not found.");
    }

    const now = new Date();
    const transition = resolveVisitorScanTransition(visitor, "check_out", now);
    visitor.checkedIn = transition.checkedIn;
    visitor.checkedOut = transition.checkedOut;
    visitor.checkedOutBy = input.guardId?.trim() || null;
    visitor.status = transition.status;

    await manager.save(VisitorSchema, visitor);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "check_out",
      guardId: input.guardId?.trim() || null,
    });

    const refreshed = await manager.findOneOrFail(VisitorSchema, {
      where: { id: visitor.id },
      relations: { type: true },
    });

    return toDto(refreshed);
  });
}
