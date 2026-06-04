import "server-only";
import { VisitorSchema } from "@/db/entities";
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
  const visitor = await ds.manager.findOneBy(VisitorSchema, { id });
  if (!visitor) {
    throw new AuthError("Visitor was not found.", 404);
  }
  if (visitor.status !== "checked_in" || visitor.checkedOut) {
    throw new AuthError("Only checked-in visitors can be flagged.", 400);
  }

  await ds.manager.update(VisitorSchema, { id }, { flagReason, flaggedBy: actor.id, flaggedAt: new Date() });
  return { id, flagReason };
}

export async function clearVisitorFlag(id: string) {
  id = assertUuid(id);
  const ds = await getParkingDataSource();
  const visitor = await ds.manager.findOneBy(VisitorSchema, { id });
  if (!visitor) {
    throw new AuthError("Visitor was not found.", 404);
  }

  await ds.manager.update(VisitorSchema, { id }, { flagReason: null, flaggedBy: null, flaggedAt: null });
  return { id, flagReason: null };
}
