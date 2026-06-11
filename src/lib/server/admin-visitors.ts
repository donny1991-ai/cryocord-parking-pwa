import "server-only";
import { VisitorScanEventSchema, VisitorSchema } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { AuthError, type AuthenticatedParkingUser } from "@/lib/server/auth";
import { getHostByStaffId } from "@/lib/server/hosts";

export interface FlagVisitorInput {
  flagReason?: unknown;
}

export interface UpdateVisitorHostInput {
  hostStaffId?: unknown;
}

const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function assertFlagReason(value: unknown) {
  if (typeof value !== "string") {
    throw new AuthError("Flag reason is required.", 400);
  }

  const reason = value.trim();
  if (!reason || reason.length > 2000) {
    throw new AuthError("Flag reason must be between 1 and 2000 characters.", 400);
  }

  return reason;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("Visitor id is invalid.", 400);
  }
  return value;
}

function toMalaysiaDate(value: Date) {
  return new Date(value.getTime() + MALAYSIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function visitDateCutoff(visitDate: string | Date | null, createdAt: Date) {
  const dateText =
    typeof visitDate === "string"
      ? visitDate.slice(0, 10)
      : visitDate
        ? toMalaysiaDate(visitDate)
        : toMalaysiaDate(createdAt);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;

  const [, year, month, day] = match;
  const midnightAfterVisitDayInMalaysia = Date.UTC(Number(year), Number(month) - 1, Number(day) + 1, 0, 0, 0, 0);
  return new Date(midnightAfterVisitDayInMalaysia - MALAYSIA_UTC_OFFSET_MS - 1000);
}

export function isVisitorHostEditOpen(
  visitDate: string | Date | null | undefined,
  createdAt: string | Date,
  now: Date = new Date(),
) {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const cutoff = visitDateCutoff(visitDate ?? null, created);
  return cutoff ? now.getTime() <= cutoff.getTime() : false;
}

function assertHostStaffId(value: unknown) {
  const staffId = String(value ?? "").trim();
  if (!staffId) {
    throw new AuthError("Host is required.", 400);
  }
  if (staffId.length > 80) {
    throw new AuthError("Host staff ID is too long.", 400);
  }
  return staffId;
}

function change(from: string | null, to: string | null) {
  if ((from ?? null) === (to ?? null)) return null;
  return { from, to };
}

export async function updateVisitorHost(id: string, input: UpdateVisitorHostInput, actor: AuthenticatedParkingUser) {
  id = assertUuid(id);
  const hostStaffId = assertHostStaffId(input.hostStaffId);
  const host = await getHostByStaffId(hostStaffId);
  if (!host) {
    throw new AuthError("Host must be selected from the HR directory.", 400);
  }

  const ds = await getParkingDataSource();
  return ds.transaction(async (manager) => {
    const visitor = await manager.findOneBy(VisitorSchema, { id });
    if (!visitor) {
      throw new AuthError("Visitor was not found.", 404);
    }
    if (!isVisitorHostEditOpen(visitor.visitDate, visitor.createdAt)) {
      throw new AuthError("Host can only be changed until the end of the visit date.", 400);
    }

    const nextDepartment = host.department || null;
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    const staffChange = change(visitor.hostStaffId, host.staffId);
    if (staffChange) changes.hostStaffId = staffChange;
    const departmentChange = change(visitor.hostDepartment, nextDepartment);
    if (departmentChange) changes.hostDepartment = departmentChange;

    if (Object.keys(changes).length === 0) {
      return {
        id,
        hostStaffId: visitor.hostStaffId,
        hostDepartment: visitor.hostDepartment,
        host,
        changed: false,
      };
    }

    await manager.update(VisitorSchema, { id }, {
      hostStaffId: host.staffId,
      hostDepartment: nextDepartment,
    });
    await manager.insert(VisitorScanEventSchema, {
      visitorId: id,
      eventType: "details_updated",
      guardId: actor.id,
      source: "pwa",
      metadata: {
        reason: "host_reassigned",
        changes,
      },
    });

    return {
      id,
      hostStaffId: host.staffId,
      hostDepartment: nextDepartment,
      host,
      changed: true,
    };
  });
}

export async function flagVisitor(id: string, input: FlagVisitorInput, actor: AuthenticatedParkingUser) {
  id = assertUuid(id);
  const flagReason = assertFlagReason(input.flagReason);
  const ds = await getParkingDataSource();

  return ds.transaction(async (manager) => {
    const visitor = await manager.findOneBy(VisitorSchema, { id });
    if (!visitor) {
      throw new AuthError("Visitor was not found.", 404);
    }
    if (visitor.status !== "checked_in" || visitor.checkedOut) {
      throw new AuthError("Only checked-in registrations can be marked for review.", 400);
    }

    const flaggedAt = new Date();
    const previousReason = visitor.flagReason?.trim() || null;
    await manager.update(VisitorSchema, { id }, { flagReason, flaggedBy: actor.id, flaggedAt });
    await manager.insert(VisitorScanEventSchema, {
      visitorId: id,
      eventType: "details_updated",
      guardId: actor.id,
      source: "pwa-admin",
      metadata: {
        reason: previousReason ? "visit_review_reason_updated" : "visit_marked_for_review",
        flagReason,
        ...(previousReason ? { previousReason } : {}),
      },
    });

    return { id, flagReason, flaggedBy: actor.id, flaggedAt: flaggedAt.toISOString() };
  });
}

export async function clearVisitorFlag(id: string, actor: AuthenticatedParkingUser) {
  id = assertUuid(id);
  const ds = await getParkingDataSource();

  return ds.transaction(async (manager) => {
    const visitor = await manager.findOneBy(VisitorSchema, { id });
    if (!visitor) {
      throw new AuthError("Visitor was not found.", 404);
    }
    if (visitor.status !== "checked_in" || visitor.checkedOut) {
      throw new AuthError("Only checked-in registrations can have a review flag cleared.", 400);
    }

    const previousReason = visitor.flagReason?.trim() || null;
    if (!previousReason) {
      return { id, flagReason: null, flaggedBy: null, flaggedAt: null };
    }

    await manager.update(VisitorSchema, { id }, { flagReason: null, flaggedBy: null, flaggedAt: null });
    await manager.insert(VisitorScanEventSchema, {
      visitorId: id,
      eventType: "details_updated",
      guardId: actor.id,
      source: "pwa-admin",
      metadata: {
        reason: "visit_review_flag_cleared",
        previousReason,
      },
    });

    return { id, flagReason: null, flaggedBy: null, flaggedAt: null };
  });
}
