import "server-only";
import { VisitorScanEventSchema, VisitorSchema } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { AuthError, type AuthenticatedParkingUser } from "@/lib/server/auth";

export interface FlagVisitorInput {
  flagReason?: unknown;
}

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
