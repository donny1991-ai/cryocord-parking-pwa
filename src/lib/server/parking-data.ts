import "server-only";
import { getParkingDataSource } from "@/db/client";
import type { OwnerType, Purpose, Status, VisitType } from "@/lib/enums";
import { OWNER_TYPES, PURPOSES, VISIT_TYPES } from "@/lib/enums";
import { getPreRegistrationTokenExpiresAt, getVisitTokenExpiresAt, signVisitToken } from "@/lib/qr";
import { getHostByStaffId } from "@/lib/server/hosts";
import { getParkingSettings } from "@/lib/server/admin-settings";
import type { AuditEntry, Employee, Vehicle, Visit, VisitVehicle } from "@/lib/types";
import type { DataSource } from "typeorm";

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
  logVisits: Visit[];
  allVisits: Visit[];
  occupancySeries: OccupancyPoint[];
  now: Date;
}

const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const OPTIONAL_VISITOR_COLUMNS = [
  "identity_type",
  "nric",
  "passport_number",
  "additional_vehicle_numbers",
  "visit_time",
  "visitor_count",
] as const;

type OptionalVisitorColumn = (typeof OPTIONAL_VISITOR_COLUMNS)[number];

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
  identityType: "nric" | "passport" | null;
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  additionalVehicleNumbers: string[] | null;
  checkedIn: Date | null;
  checkedOut: Date | null;
  typeCode: string;
  purpose: string;
  visitDate: string | Date | null;
  visitTime: string | null;
  visitorCount: number | null;
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
  vehicleRecords?: VisitorVehicleReadRow[];
}

interface VisitorVehicleReadRow {
  id: string;
  visitorId: string;
  vehicleNumber: string;
  vehicleNumberNormalised: string;
  isPrimary: boolean;
  status: "pending" | "checked_in" | "checked_out" | "cancelled" | "rejected";
  checkedIn: Date | null;
  checkedOut: Date | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
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
  const vehicleRecords = row.vehicleRecords ?? [];
  if (vehicleRecords.length > 0) {
    if (row.status === "cancelled" || vehicleRecords.every((vehicle) => vehicle.status === "cancelled" || vehicle.status === "rejected")) {
      return "cancelled";
    }

    const active = vehicleRecords.filter((vehicle) => vehicle.status === "checked_in");
    if (active.length > 0) {
      if (row.flagReason) return "flagged";
      const earliestCheckIn = active
        .map((vehicle) => vehicle.checkedIn)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (earliestCheckIn && isOverstayed(earliestCheckIn, now, overstayAllowedDays)) {
        return "overstayed";
      }
      return "inside";
    }

    if (vehicleRecords.every((vehicle) => vehicle.status === "checked_out")) {
      return "exited";
    }

    return "pending";
  }

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

function toVisitVehicles(row: VisitorReadRow): VisitVehicle[] {
  const vehicleRecords = row.vehicleRecords ?? [];
  const seen = new Set<string>();
  if (vehicleRecords.length > 0) {
    const vehicles: VisitVehicle[] = vehicleRecords.map((vehicle) => {
      seen.add(vehicle.vehicleNumberNormalised);
      return {
        id: vehicle.id,
        plate: vehicle.vehicleNumber,
        isPrimary: vehicle.isPrimary,
        status: vehicle.status,
        checkedIn: vehicle.checkedIn?.toISOString(),
        checkedOut: vehicle.checkedOut?.toISOString(),
        checkedInBy: vehicle.checkedInBy ?? undefined,
        checkedOutBy: vehicle.checkedOutBy ?? undefined,
      };
    });

    for (const plate of row.additionalVehicleNumbers ?? []) {
      const normalised = plate.toUpperCase().replace(/[\s-]/g, "");
      if (seen.has(normalised)) continue;
      vehicles.push({
        id: `${row.id}:${normalised}`,
        plate,
        isPrimary: false,
        status: "pending",
      });
      seen.add(normalised);
    }

    return vehicles;
  }

  return [
    {
      id: row.id,
      plate: row.vehicleNumber,
      isPrimary: true,
      status: row.status,
      checkedIn: row.checkedIn?.toISOString(),
      checkedOut: row.checkedOut?.toISOString(),
      checkedInBy: row.checkedInBy ?? undefined,
      checkedOutBy: row.checkedOutBy ?? undefined,
    },
    ...(row.additionalVehicleNumbers ?? []).map((plate) => ({
      id: `${row.id}:${plate}`,
      plate,
      isPrimary: false,
      status: "pending" as const,
    })),
  ];
}

function toVisitDateInput(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime() + MALAYSIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
  }

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function toVisitTimeInput(value: string | null) {
  if (!value) return undefined;
  const match = /^(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? value;
}

async function getAvailableVisitorColumns(ds: DataSource) {
  const rows = (await ds.manager.query(
    `
      SELECT "column_name" AS "columnName"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'parking'
        AND "table_name" = 'visitors'
        AND "column_name" = ANY($1::text[])
    `,
    [OPTIONAL_VISITOR_COLUMNS],
  )) as Array<{ columnName: OptionalVisitorColumn }>;

  return new Set(rows.map((row) => row.columnName));
}

async function tableExists(ds: DataSource, schema: string, table: string) {
  const rows = (await ds.manager.query(
    `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
    [`${schema}.${table}`],
  )) as Array<{ exists: boolean }>;

  return rows[0]?.exists === true;
}

function optionalVisitorSelect(
  columns: Set<OptionalVisitorColumn>,
  column: OptionalVisitorColumn,
  alias: string,
  fallback: string,
) {
  return columns.has(column) ? `v."${column}" AS "${alias}"` : `${fallback} AS "${alias}"`;
}

function toVisit(row: VisitorReadRow, now: Date, overstayAllowedDays: number): Visit {
  const vehicles = toVisitVehicles(row);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "checked_in");
  const checkedOutVehicles = vehicles.filter((vehicle) => vehicle.status === "checked_out");
  const firstVehicleEntry = [...activeVehicles, ...checkedOutVehicles]
    .map((vehicle) => (vehicle.checkedIn ? new Date(vehicle.checkedIn) : null))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const lastVehicleExit = checkedOutVehicles
    .map((vehicle) => (vehicle.checkedOut ? new Date(vehicle.checkedOut) : null))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const entryTime = firstVehicleEntry ?? row.checkedIn ?? row.createdAt;
  const purposeNotes = [row.remarks, row.flagReason ? `Flag: ${row.flagReason}` : null].filter(Boolean).join("\n");
  const visitDate = toVisitDateInput(row.visitDate);
  const activeVehicle = activeVehicles[0];

  return {
    id: row.id,
    plate: row.vehicleNumber,
    additionalPlates: row.additionalVehicleNumbers ?? [],
    vehicles,
    activeVehicleNumber: activeVehicle?.plate,
    visitorName: row.name,
    visitorContact: row.phoneNumber,
    organisation: row.organisation ?? undefined,
    identityType: row.identityType ?? undefined,
    nric: row.nric ?? undefined,
    passportNumber: row.passportNumber ?? undefined,
    visitType: toVisitType(row.typeCode),
    purpose: toPurpose(row.purpose),
    purposeNotes: purposeNotes || undefined,
    visitDate: visitDate ?? undefined,
    visitTime: toVisitTimeInput(row.visitTime),
    visitorCount: row.visitorCount ?? undefined,
    hostStaffId: row.hostStaffId ?? undefined,
    hostDepartment: row.hostDepartment ?? undefined,
    flagReason: row.flagReason ?? undefined,
    entryTime: entryTime.toISOString(),
    entryGuardId: row.checkedInBy ?? row.createdBy ?? "system",
    exitTime: (lastVehicleExit ?? row.checkedOut)?.toISOString(),
    exitGuardId: checkedOutVehicles.find((vehicle) => vehicle.checkedOut === lastVehicleExit?.toISOString())?.checkedOutBy ?? row.checkedOutBy ?? undefined,
    status: toUiStatus(row, now, overstayAllowedDays),
    createdAt: row.createdAt.toISOString(),
  };
}

async function readVisitors() {
  const ds = await getParkingDataSource();
  const columns = await getAvailableVisitorColumns(ds);
  const rows = (await ds.manager.query(
    `
      SELECT
        v."id",
        v."name",
        v."phone_number" AS "phoneNumber",
        v."organisation",
        ${optionalVisitorSelect(columns, "identity_type", "identityType", "NULL::text")},
        ${optionalVisitorSelect(columns, "nric", "nric", "NULL::text")},
        ${optionalVisitorSelect(columns, "passport_number", "passportNumber", "NULL::text")},
        v."vehicle_number" AS "vehicleNumber",
        ${optionalVisitorSelect(columns, "additional_vehicle_numbers", "additionalVehicleNumbers", "ARRAY[]::text[]")},
        v."checked_in" AS "checkedIn",
        v."checked_out" AS "checkedOut",
        vt."code" AS "typeCode",
        v."purpose",
        v."visit_date" AS "visitDate",
        ${optionalVisitorSelect(columns, "visit_time", "visitTime", "NULL::text")},
        ${optionalVisitorSelect(columns, "visitor_count", "visitorCount", "NULL::integer")},
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
  )) as VisitorReadRow[];

  if (rows.length === 0) return rows;
  if (!(await tableExists(ds, "parking", "visitor_vehicles"))) return rows;

  const vehicleRows = (await ds.manager.query(
    `
      SELECT
        "id",
        "visitor_id" AS "visitorId",
        "vehicle_number" AS "vehicleNumber",
        "vehicle_number_normalised" AS "vehicleNumberNormalised",
        "is_primary" AS "isPrimary",
        "status",
        "checked_in" AS "checkedIn",
        "checked_out" AS "checkedOut",
        "checked_in_by" AS "checkedInBy",
        "checked_out_by" AS "checkedOutBy"
      FROM "parking"."visitor_vehicles"
      WHERE "visitor_id" = ANY($1::uuid[])
      ORDER BY "is_primary" DESC, "vehicle_number" ASC
    `,
    [rows.map((row) => row.id)],
  )) as VisitorVehicleReadRow[];

  const byVisitor = new Map<string, VisitorVehicleReadRow[]>();
  for (const vehicle of vehicleRows) {
    const current = byVisitor.get(vehicle.visitorId) ?? [];
    current.push(vehicle);
    byVisitor.set(vehicle.visitorId, current);
  }

  return rows.map((row) => ({
    ...row,
    vehicleRecords: byVisitor.get(row.id) ?? [],
  }));
}

function buildCounts(visits: Visit[]) {
  const inside = visits.reduce(
    (sum, visit) =>
      sum +
      (visit.status === "inside"
        ? (visit.vehicles?.filter((vehicle) => vehicle.status === "checked_in").length ?? 1)
        : 0),
    0,
  );
  const overstayed = visits
    .filter((visit) => visit.status === "overstayed")
    .reduce((sum, visit) => sum + (visit.vehicles?.filter((vehicle) => vehicle.status === "checked_in").length ?? 1), 0);
  const flagged = visits
    .filter((visit) => visit.status === "flagged")
    .reduce((sum, visit) => sum + (visit.vehicles?.filter((vehicle) => vehicle.status === "checked_in").length ?? 1), 0);
  const todayEntries = visits.filter((v) => {
    const date = new Date(v.createdAt);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }).length;

  return { inside, overstayed, flagged, todayEntries, currentlyInside: inside + overstayed + flagged };
}

function buildOccupancySeries(visits: Visit[], now: Date): OccupancyPoint[] {
  const vehicleVisits = visits.flatMap((visit) => {
    const vehicles = visit.vehicles?.filter((vehicle) => vehicle.checkedIn) ?? [];
    if (vehicles.length === 0) return [visit];
    return vehicles.map((vehicle) => ({
      ...visit,
      plate: vehicle.plate,
      entryTime: vehicle.checkedIn ?? visit.entryTime,
      exitTime: vehicle.checkedOut,
      status:
        vehicle.status === "checked_in"
          ? visit.status
          : vehicle.status === "checked_out"
            ? "exited"
            : visit.status,
    }));
  });
  const start = new Date(now);
  start.setHours(8, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const hourStart = new Date(start.getTime() + i * 60 * 60 * 1000);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    const inside = vehicleVisits.filter((visit) => {
      if (visit.status === "pending") return false;
      const entry = new Date(visit.entryTime);
      const exit = visit.exitTime ? new Date(visit.exitTime) : null;
      return entry <= hourEnd && (!exit || exit >= hourStart);
    }).length;
    const entries = vehicleVisits.filter((visit) => {
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

function expandInsideVehicleVisits(visits: Visit[]): Visit[] {
  return visits.flatMap((visit) => {
    const activeVehicles = visit.vehicles?.filter((vehicle) => vehicle.status === "checked_in") ?? [];
    if (activeVehicles.length === 0) return [];
    return activeVehicles.map((vehicle) => ({
      ...visit,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      activeVehicleNumber: vehicle.plate,
      registrationPlate: visit.plate,
      registrationVehicleCount: visit.vehicles?.length,
      registrationVehicleRole: vehicle.isPrimary ? "primary" as const : "linked" as const,
      entryTime: vehicle.checkedIn ?? visit.entryTime,
      entryGuardId: vehicle.checkedInBy ?? visit.entryGuardId,
      exitTime: undefined,
      exitGuardId: undefined,
    }));
  });
}

function getVehicleUiStatus(visit: Visit, vehicle: VisitVehicle): Status {
  if (vehicle.status === "checked_in") {
    if (visit.status === "flagged" || visit.status === "overstayed") return visit.status;
    return "inside";
  }
  if (vehicle.status === "checked_out") return "exited";
  if (vehicle.status === "cancelled" || vehicle.status === "rejected") return "cancelled";
  return "pending";
}

export function expandLogVehicleVisits(visits: Visit[]): Visit[] {
  return visits
    .flatMap((visit) => {
      const vehicles = visit.vehicles ?? [];
      if (vehicles.length <= 1) return [visit];

      return vehicles.map((vehicle) => ({
        ...visit,
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        activeVehicleNumber: vehicle.status === "checked_in" ? vehicle.plate : undefined,
        registrationPlate: visit.plate,
        registrationVehicleCount: vehicles.length,
        registrationVehicleRole: vehicle.isPrimary ? "primary" as const : "linked" as const,
        entryTime: vehicle.checkedIn ?? visit.entryTime,
        entryGuardId: vehicle.checkedInBy ?? visit.entryGuardId,
        exitTime: vehicle.checkedOut,
        exitGuardId: vehicle.checkedOutBy ?? visit.exitGuardId,
        status: getVehicleUiStatus(visit, vehicle),
      }));
    })
    .sort((a, b) => {
      const aTime = a.exitTime ?? a.entryTime ?? a.createdAt;
      const bTime = b.exitTime ?? b.entryTime ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });
}

export async function getParkingSnapshot(): Promise<ParkingSnapshot> {
  const now = new Date();
  const [rows, settings] = await Promise.all([readVisitors(), getParkingSettings()]);
  const allVisits = rows.map((row) => toVisit(row, now, settings.overstayAllowedDays));
  const insideVisits = expandInsideVehicleVisits(allVisits);
  const logVisits = expandLogVehicleVisits(allVisits);

  return {
    counts: buildCounts(allVisits),
    insideVisits,
    logVisits,
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
  const host = await getHostByStaffId(row.hostStaffId);
  if (host) {
    visit.host = host;
    visit.hostDepartment = host.department;
  }
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
