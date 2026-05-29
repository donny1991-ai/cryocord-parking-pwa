import "server-only";
import { VisitorScanEventSchema, VisitorSchema, VisitorTypeSchema } from "@/db/entities";
import type { VisitorEntity, VisitorStatus } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { assertQrSigningConfigured, signVisitToken, verifyVisitToken } from "@/lib/qr";
import { normalisePlate } from "@/lib/utils";
import { assertScanAction, resolveVisitorScanTransition, type ScanAction } from "./visitor-state";

export type VisitorTypeCode = "guest" | "vendor" | "client" | "staff";
export type { ScanAction } from "./visitor-state";

export interface CreateVisitorInput {
  name: string;
  phoneNumber: string;
  vehicleNumber: string;
  typeCode: VisitorTypeCode;
  remarks?: string;
  guardId?: string;
}

export interface ScanVisitorInput {
  token: string;
  action?: ScanAction;
  guardId?: string;
}

export interface VisitorDto {
  id: string;
  name: string;
  phoneNumber: string;
  vehicleNumber: string;
  checkedIn: string | null;
  checkedOut: string | null;
  typeCode: string;
  typeLabel: string;
  remarks: string | null;
  status: VisitorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IssuedVisitorPass {
  visitor: VisitorDto;
  token: string;
}

function toDto(visitor: VisitorEntity): VisitorDto {
  return {
    id: visitor.id,
    name: visitor.name,
    phoneNumber: visitor.phoneNumber,
    vehicleNumber: visitor.vehicleNumber,
    checkedIn: visitor.checkedIn?.toISOString() ?? null,
    checkedOut: visitor.checkedOut?.toISOString() ?? null,
    typeCode: visitor.type?.code ?? String(visitor.typeId),
    typeLabel: visitor.type?.label ?? "Unknown",
    remarks: visitor.remarks,
    status: visitor.status,
    createdAt: visitor.createdAt.toISOString(),
    updatedAt: visitor.updatedAt.toISOString(),
  };
}

export function assertVisitorTypeCode(value: unknown): VisitorTypeCode {
  if (value === "guest" || value === "vendor" || value === "client" || value === "staff") {
    return value;
  }

  throw new Error("Invalid visitor type.");
}

export async function createVisitorPass(input: CreateVisitorInput): Promise<IssuedVisitorPass> {
  assertQrSigningConfigured();
  const ds = await getParkingDataSource();
  const tokenId = crypto.randomUUID();

  const visitor = await ds.transaction(async (manager) => {
    const type = await manager.findOneByOrFail(VisitorTypeSchema, { code: input.typeCode });
    const created = manager.create(VisitorSchema, {
      name: input.name.trim(),
      phoneNumber: input.phoneNumber.trim(),
      vehicleNumber: input.vehicleNumber.trim().toUpperCase(),
      vehicleNumberNormalised: normalisePlate(input.vehicleNumber),
      typeId: type.id,
      type,
      remarks: input.remarks?.trim() || null,
      qrTokenJti: tokenId,
      status: "pending",
      createdBy: input.guardId?.trim() || null,
    });

    const saved = await manager.save(VisitorSchema, created);
    await manager.insert(VisitorScanEventSchema, {
      visitorId: saved.id,
      eventType: "pass_issued",
      guardId: input.guardId?.trim() || null,
      metadata: { vehicleNumber: saved.vehicleNumber },
    });

    return manager.findOneOrFail(VisitorSchema, {
      where: { id: saved.id },
      relations: { type: true },
    });
  });

  return {
    visitor: toDto(visitor),
    token: await signVisitToken(visitor.id, tokenId),
  };
}

export async function scanVisitorPass(input: ScanVisitorInput): Promise<VisitorDto> {
  const claims = await verifyVisitToken(input.token);
  const ds = await getParkingDataSource();

  const result = await ds.transaction<
    | { visitor: VisitorDto }
    | { rejected: { visitorId?: string; reason: "visitor_not_found" | "token_mismatch"; message: string } }
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

    if (claims.tokenId && visitor.qrTokenJti && claims.tokenId !== visitor.qrTokenJti) {
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
    const transition = resolveVisitorScanTransition(visitor, action, now);

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
    await ds.manager.insert(VisitorScanEventSchema, {
      visitorId: result.rejected.visitorId,
      eventType: "scan_rejected",
      guardId: input.guardId?.trim() || null,
      metadata: { reason: result.rejected.reason },
    });
    throw new Error(result.rejected.message);
  }

  return result.visitor;
}
