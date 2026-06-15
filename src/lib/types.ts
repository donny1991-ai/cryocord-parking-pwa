import type { OwnerType, Purpose, Status, VisitType } from "./enums";

/** parking.vehicles */
export interface Vehicle {
  id: string;
  plate: string;
  plateNormalised: string;
  ownerName?: string;
  ownerContact?: string;
  ownerEmail?: string;
  ownerDepartment?: string;
  ownerType?: OwnerType;
  staffId?: string; // ERPNext employee
  notes?: string;
  blacklisted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** parking.visits — `plate` is denormalised for audit immutability. */
export interface VisitVehicle {
  id: string;
  plate: string;
  isPrimary: boolean;
  status: "pending" | "checked_in" | "checked_out" | "cancelled" | "rejected";
  displayStatus?: Status;
  checkedIn?: string;
  checkedOut?: string;
  checkedInBy?: string;
  checkedOutBy?: string;
}

export interface VisitEntrySnapshot {
  id: string;
  url?: string;
  capturedAt: string;
}

export interface Visit {
  id: string;
  vehicleId?: string;
  plate: string;
  additionalPlates?: string[];
  vehicles?: VisitVehicle[];
  activeVehicleNumber?: string;
  registrationPlate?: string;
  registrationVehicleCount?: number;
  registrationVehicleRole?: "primary" | "linked";
  visitorName: string;
  visitorContact: string;
  organisation?: string;
  representingOrganisation?: string;
  identityType?: "nric" | "passport";
  nric?: string;
  passportNumber?: string;
  visitorIc?: string; // Legacy alias for NRIC.
  visitType: VisitType;
  purpose: Purpose;
  purposeNotes?: string;
  visitDate?: string;
  visitTime?: string;
  visitorCount?: number;
  otherVisitorNames?: string[];
  hostStaffId?: string;
  hostDepartment?: string;
  host?: Employee;
  flagReason?: string;
  flaggedBy?: string;
  flaggedAt?: string;
  entryTime: string;
  entryGuardId: string;
  entryPhotoUrl?: string; // Short-lived Supabase Storage signed URL.
  entryPhotoCapturedAt?: string;
  entrySnapshots?: VisitEntrySnapshot[];
  exitTime?: string;
  exitGuardId?: string;
  qrToken?: string; // opaque signed reference, no PII (see lib/qr.ts)
  qrTokenExpiresAt?: string;
  status: Status;
  createdAt: string;
}

export interface VisitorRequest {
  id: string;
  name: string;
  phoneNumber: string;
  organisation?: string;
  representingOrganisation?: string;
  identityType: "nric" | "passport";
  nric?: string;
  passportNumber?: string;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  purpose: Purpose;
  visitorCount?: number;
  otherVisitorNames: string[];
  requestedHostText: string;
  remarks?: string;
  status: "submitted" | "converted" | "rejected";
  convertedVisitorId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
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
  actorLabel?: string;
  actionType: AuditAction;
  activityTitle?: string;
  activityDescription?: string;
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
  phone?: string;
  extension?: string;
  email?: string;
}
