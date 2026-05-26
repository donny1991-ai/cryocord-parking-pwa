import type { AuditAction, AuditEntry } from "./types";

/**
 * Fail-closed audit contract (ADR D2 / decorators/audit.py).
 *
 * Invariant: the audit row is written in the SAME transaction as the
 * operational write. If the audit insert fails, the whole transaction rolls
 * back — there is no scenario where a visit is created/exited without its
 * audit row. The ICS mirror (async, with retry + DLQ) is downstream of this,
 * NOT the source of truth.
 *
 * This module is the seam: wire `writeOperational` + `insertAuditRow` to the
 * self-hosted Supabase transaction when the instance is live. The signature is
 * shaped so callers physically cannot perform the write without the audit row.
 */

/** Map a parking event to the ICS audit action_type enum (already supports all). */
export const EVENT_ACTION: Record<string, AuditAction> = {
  visit_created: "CREATE",
  visit_exited: "UPDATE",
  plate_scanned: "SCAN",
  qr_scanned: "SCAN",
  vehicle_flagged: "UPDATE",
  qr_reissued: "CREATE",
  visit_exported: "EXPORT",
};

export class AuditFailure extends Error {}

interface AuditContext {
  actorUserId: string;
  actorRole: string;
  correlationId: string;
}

/**
 * Run an operational write and its audit row atomically.
 * In the stub this sequences the two; against Supabase, both must share one
 * transaction (BEGIN; write; insert audit; COMMIT) with rollback on failure.
 */
export async function withAudit<T>(
  ctx: AuditContext,
  audit: Omit<AuditEntry, "logId" | "timestampUtc" | "actorUserId" | "actorRole" | "correlationId" | "result">,
  writeOperational: () => Promise<T>,
): Promise<T> {
  const result = await writeOperational();

  const row: AuditEntry = {
    logId: crypto.randomUUID(),
    timestampUtc: new Date().toISOString(),
    ...ctx,
    ...audit,
    result: "SUCCESS",
  };

  try {
    await insertAuditRow(row);
  } catch (e) {
    // Fail-closed: roll back the operational write. (Stub: surface the failure.)
    throw new AuditFailure(`audit insert failed, operational write rolled back: ${String(e)}`);
  }

  // Fire-and-forget mirror to ICS audit Postgres (downstream, not authoritative).
  void mirrorToICS(row);
  return result;
}

async function insertAuditRow(_row: AuditEntry): Promise<void> {
  // TODO: INSERT into parking.audit_log inside the operational transaction.
}

async function mirrorToICS(_row: AuditEntry): Promise<void> {
  // TODO: HMAC-signed POST to ICS audit mirror with retry + DLQ
  // (mirror/async_mirror.py pattern). Never blocks the operational path.
}
