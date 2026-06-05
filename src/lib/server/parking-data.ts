import "server-only";
import { getParkingDataSource } from "@/db/client";
import type { OwnerType, Purpose, Status, VisitType } from "@/lib/enums";
import { OWNER_TYPES, PURPOSES, VISIT_TYPES } from "@/lib/enums";
import { getPreRegistrationTokenExpiresAt, getVisitTokenExpiresAt, signVisitToken } from "@/lib/qr";
import { getParkingSettings } from "@/lib/server/admin-settings";
import type { AuditEntry, Employee, Vehicle, Visit } from "@/lib/types";

export interface ParkingCounts {
  inside: number;
  overstayed: number;
  flagged: number;
  todayEntries: number;
  currentlyInside: number;
}

export interface OccupancyPoint {
  hour: string;
  entries: number;
  inside: number;
}

export interface ParkingSnapshot {
  counts: ParkingCounts;
  insideVisits: Visit[];
  allVisits: Visit[];
  occupancySeries: OccupancyPoint[];
  now: Date;
}

const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const demoEmployees: Employee[] = [
  { staffId: "EMP-0142", name: "Dr. Lim Wei Sheng", department: "Laboratory" },
  { staffId: "EMP-0088", name: "Nurul Huda", department: "Sales Operations" },
  { staffId: "EMP-0211", name: "James Then", department: "Management" },
  { staffId: "EMP-0319", name: "Rajesh Kumar", department: "Finance" },
  { staffId: "EMP-0276", name: "Siti Aminah", department: "Human Resources" },
  { staffId: "EMP-0405", name: "Dr. Tan Mei Ling", department: "R&D" },
];

interface VisitorReadRow {
  id: string;
  name: string;
  phoneNumber: string;
  organisation: string | null;
  vehicleNumber: string;
  checkedIn: Date | null;
  checkedOut: Date | null;
  typeCode: string;
  purpose: string;
  visitDate: string | Date | null;
  remarks: string | null;
  hostStaffId: string | null;
  hostDepartment: string | null;
  flagReason: string | null;
  qrTokenJti: string | null;
  status: "pending" | "checked_in" | "checked_out" | "cancelled";
  createdBy: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  createdAt: Date;
}

interface ScanEventReadRow {
  id: string;
  visitorId: string | null;
  eventType:
    | "pass_issued"
    | "scan_reviewed"
    | "details_updated"
    | "check_in"
    | "check_out"
    | "pass_cancelled"
    | "scan_rejected";
  guardId: string | null;
  scannedAt: Date;
}

interface VehicleReadRow {
  id: string;
  plate: string;
  plateNormalised: string;
  ownerName: string | null;
  ownerContact: string | null;
  ownerEmail: string | null;
  ownerType: string | null;
  staffId: string | null;
  notes: string | null;
  blacklisted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toPurpose(value: string): Purpose {
  return (PURPOSES as readonly string[]).includes(value) ? (value as Purpose) : "other";
}

function toVisitType(value: string): VisitType {
  return (VISIT_TYPES as readonly string[]).includes(value) ? (value as VisitType) : "visitor";
}

function toOwnerType(value: string | null): OwnerType | undefined {
  return value && (OWNER_TYPES as readonly string[]).includes(value) ? (value as OwnerType) : undefined;
}

export function getOverstayCutoff(checkedIn: Date, allowedDays: number) {
  const malaysiaTime = new Date(checkedIn.getTime() + MALAYSIA_UTC_OFFSET_MS);
  const cutoffMalaysiaUtc = Date.UTC(
    malaysiaTime.getUTCFullYear(),
    malaysiaTime.getUTCMonth(),
    malaysiaTime.getUTCDate() + allowedDays + 1,
    0,
    0,
    0,
    0,
  );
  return new Date(cutoffMalaysiaUtc - MALAYSIA_UTC_OFFSET_MS);
}

export function isOverstayed(checkedIn: Date, now: Date, allowedDays: number) {
  return now.getTime() >= getOverstayCutoff(checkedIn, allowedDays).getTime();
}

function toUiStatus(row: VisitorReadRow, now: Date, overstayAllowedDays: number): Status {
  if (row.status === "cancelled") {
    return "cancelled";
  }
  if (row.status === "checked_out" || row.checkedOut) {
    return "exited";
  }
  if (row.status !== "checked_in" || !row.checkedIn) {
    return "pending";
  }
  if (row.flagReason) {
    return "flagged";
  }
  if (isOverstayed(row.checkedIn, now, overstayAllowedDays)) {
    return "overstayed";
  }
  return "inside";
}

function toVisitDateInput(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime() + MALAYSIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function toVisit(row: VisitorReadRow, now: Date, overstayAllowedDays: number): Visit {
  const entryTime = row.checkedIn ?? row.createdAt;
  const purposeNotes = [row.remarks, row.flagReason ? `Flag: ${row.flagReason}` : null].filter(Boolean).join("\n");
  const visitDate = toVisitDateInput(row.visitDate);

  return {
    id: row.id,
    plate: row.vehicleNumber,
    visitorName: row.name,
    visitorContact: row.phoneNumber,
    organisation: row.organisation ?? undefined,
    visitType: toVisitType(row.typeCode),
    purpose: toPurpose(row.purpose),
    purposeNotes: purposeNotes || undefined,
    visitDate: visitDate ?? undefined,
    hostStaffId: row.hostStaffId ?? undefined,
    hostDepartment: row.hostDepartment ?? undefined,
    flagReason: row.flagReason ?? undefined,
    entryTime: entryTime.toISOString(),
    entryGuardId: row.checkedInBy ?? row.createdBy ?? "system",
    exitTime: row.checkedOut?.toISOString(),
    exitGuardId: row.checkedOutBy ?? undefined,
    status: toUiStatus(row, now, overstayAllowedDays),
    createdAt: row.createdAt.toISOString(),
  };
}

async function readVisitors() {
  const ds = await getParkingDataSource();
  return ds.manager.query(
    `
      SELECT
        v."id",
        v."name",
        v."phone_number" AS "phoneNumber",
        v."organisation",
        v."vehicle_number" AS "vehicleNumber",
        v."checked_in" AS "checkedIn",
        v."checked_out" AS "checkedOut",
        vt."code" AS "typeCode",
        v."purpose",
        v."visit_date" AS "visitDate",
        v."remarks",
        v."host_staff_id" AS "hostStaffId",
        v."host_department" AS "hostDepartment",
        v."flag_reason" AS "flagReason",
        v."qr_token_jti" AS "qrTokenJti",
        v."status",
        v."created_by" AS "createdBy",
        v."checked_in_by" AS "checkedInBy",
        v."checked_out_by" AS "checkedOutBy",
        v."created_at" AS "createdAt"
      FROM "parking"."visitors" v
      INNER JOIN "parking"."visitor_types" vt ON vt."id" = v."type_id"
      ORDER BY COALESCE(v."checked_in", v."created_at") DESC
    `,
  ) as Promise<VisitorReadRow[]>;
}

function buildCounts(visits: Visit[]) {
  const inside = visits.filter((v) => v.status === "inside").length;
  const overstayed = visits.filter((v) => v.status === "overstayed").length;
  const flagged = visits.filter((v) => v.status === "flagged").length;
  const todayEntries = visits.filter((v) => {
    const date = new Date(v.createdAt);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }).length;

  return { inside, overstayed, flagged, todayEntries, currentlyInside: inside + overstayed + flagged };
}

function buildOccupancySeries(visits: Visit[], now: Date): OccupancyPoint[] {
  const start = new Date(now);
  start.setHours(8, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const hourStart = new Date(start.getTime() + i * 60 * 60 * 1000);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    const inside = visits.filter((visit) => {
      if (visit.status === "pending") return false;
      const entry = new Date(visit.entryTime);
      const exit = visit.exitTime ? new Date(visit.exitTime) : null;
      return entry <= hourEnd && (!exit || exit >= hourStart);
    }).length;
    const entries = visits.filter((visit) => {
      if (visit.status === "pending") return false;
      const entry = new Date(visit.entryTime);
      return entry >= hourStart && entry < hourEnd;
    }).length;

    return {
      hour: hourStart.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false }),
      entries,
      inside,
    };
  });
}

export async function getParkingSnapshot(): Promise<ParkingSnapshot> {
  const now = new Date();
  const [rows, settings] = await Promise.all([readVisitors(), getParkingSettings()]);
  const allVisits = rows.map((row) => toVisit(row, now, settings.overstayAllowedDays));
  const insideVisits = allVisits.filter((v) => v.status === "inside" || v.status === "overstayed" || v.status === "flagged");

  return {
    counts: buildCounts(allVisits),
    insideVisits,
    allVisits,
    occupancySeries: buildOccupancySeries(allVisits, now),
    now,
  };
}

export async function getVisitById(id: string) {
  const now = new Date();
  const [rows, settings] = await Promise.all([readVisitors(), getParkingSettings()]);
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return null;

  const visit = toVisit(row, now, settings.overstayAllowedDays);
  if (row.qrTokenJti) {
    const visitDate = toVisitDateInput(row.visitDate);
    const expiresAt = visitDate
      ? getPreRegistrationTokenExpiresAt(visitDate)
      : getVisitTokenExpiresAt(row.createdAt);
    visit.qrToken = await signVisitToken(row.id, row.qrTokenJti, row.createdAt, expiresAt);
    visit.qrTokenExpiresAt = expiresAt.toISOString();
  }
  return visit;
}

export async function getVisitAuditTrail(visitId: string): Promise<AuditEntry[]> {
  const ds = await getParkingDataSource();
  const rows = (await ds.manager.query(
    `
      SELECT
        "id",
        "visitor_id" AS "visitorId",
        "event_type" AS "eventType",
        "guard_id" AS "guardId",
        "scanned_at" AS "scannedAt"
      FROM "parking"."visitor_scan_events"
      WHERE "visitor_id" = $1
      ORDER BY "scanned_at" ASC
    `,
    [visitId],
  )) as ScanEventReadRow[];

  return rows.map((row) => ({
    logId: row.id,
    timestampUtc: row.scannedAt.toISOString(),
    correlationId: row.id,
    actorUserId: row.guardId ?? "system",
    actorRole: "parking",
    actionType:
      row.eventType === "pass_issued"
        ? "CREATE"
        : row.eventType === "pass_cancelled" || row.eventType === "details_updated"
          ? "UPDATE"
          : "SCAN",
    targetDoctype: "Parking Visit",
    targetRecordId: row.visitorId ?? undefined,
    result: row.eventType === "scan_rejected" ? "FAILURE" : "SUCCESS",
  }));
}

export function getDemoEmployees() {
  return demoEmployees;
}

export async function getParkingVehicles(): Promise<Vehicle[]> {
  const ds = await getParkingDataSource();
  const rows = (await ds.manager.query(`
    SELECT
      "id",
      "plate",
      "plate_normalised" AS "plateNormalised",
      "owner_name" AS "ownerName",
      "owner_contact" AS "ownerContact",
      "owner_email" AS "ownerEmail",
      "owner_type" AS "ownerType",
      "staff_id" AS "staffId",
      "notes",
      "blacklisted",
      "created_at" AS "createdAt",
      "updated_at" AS "updatedAt"
    FROM "parking"."vehicles"
    ORDER BY "blacklisted" DESC, "plate_normalised" ASC
  `)) as VehicleReadRow[];

  return rows.map((row) => ({
    id: row.id,
    plate: row.plate,
    plateNormalised: row.plateNormalised,
    ownerName: row.ownerName ?? undefined,
    ownerContact: row.ownerContact ?? undefined,
    ownerEmail: row.ownerEmail ?? undefined,
    ownerType: toOwnerType(row.ownerType),
    staffId: row.staffId ?? undefined,
    notes: row.notes ?? undefined,
    blacklisted: row.blacklisted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
