import type { OwnerType, Purpose, Status, VisitType } from "./enums";

/** parking.vehicles */
export interface Vehicle {
  id: string;
  plate: string;
  plateNormalised: string;
  ownerName?: string;
  ownerContact?: string;
  ownerEmail?: string;
  ownerType?: OwnerType;
  staffId?: string; // ERPNext employee
  notes?: string;
  blacklisted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** parking.visits — `plate` is denormalised for audit immutability. */
export interface Visit {
  id: string;
  vehicleId?: string;
  plate: string;
  visitorName: string;
  visitorContact: string;
  visitorIc?: string; // PDPA-sensitive, optional, off by default
  visitType: VisitType;
  purpose: Purpose;
  purposeNotes?: string;
  visitDate?: string;
  hostStaffId?: string;
  hostDepartment?: string;
  flagReason?: string;
  entryTime: string;
  entryGuardId: string;
  entryPhotoUrl?: string; // Azure Blob (MY West)
  exitTime?: string;
  exitGuardId?: string;
  qrToken?: string; // opaque signed reference, no PII (see lib/qr.ts)
  qrTokenExpiresAt?: string;
  status: Status;
  createdAt: string;
}

/** ICS audit action types reused for parking events (see ADR D2). */
export type AuditAction =
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "SCAN";

/** parking.audit_log — fields aligned to the ICS Audit Log DocType. */
export interface AuditEntry {
  logId: string;
  timestampUtc: string;
  correlationId: string;
  actorUserId: string;
  actorRole: string;
  actionType: AuditAction;
  targetDoctype: "Parking Visit" | "Parking Vehicle";
  targetRecordId?: string;
  result: "SUCCESS" | "FAILURE" | "DENIED";
  failureReason?: string;
}

/** ERPNext employee shape for host autocomplete (cached client-side). */
export interface Employee {
  staffId: string;
  name: string;
  department: string;
}
