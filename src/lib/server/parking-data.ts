import "server-only";
import { getParkingDataSource } from "@/db/client";
import type { OwnerType, Purpose, Status, VisitType } from "@/lib/enums";
import { OWNER_TYPES, PURPOSES, VISIT_TYPES } from "@/lib/enums";
import { labelize, purposeLabel } from "@/lib/labels";
import { getPreRegistrationTokenExpiresAt, getVisitTokenExpiresAt, signVisitToken } from "@/lib/qr";
import { getHostByStaffId, getHostsByStaffIds } from "@/lib/server/hosts";
import { getParkingSettings } from "@/lib/server/admin-settings";
import { createEntrySnapshotSignedUrl } from "@/lib/server/entry-snapshot-storage";
import { cacheJson } from "@/lib/server/cache";
import { PARKING_CACHE_KEYS } from "@/lib/server/parking-cache";
import type { AuditEntry, Employee, Vehicle, Visit, VisitEntrySnapshot, VisitVehicle } from "@/lib/types";
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
  "representing_organisation",
  "identity_type",
  "nric",
  "passport_number",
  "additional_vehicle_numbers",
  "other_visitor_names",
  "visit_time",
  "visitor_count",
  "entry_photo_bucket",
  "entry_photo_path",
  "entry_photo_content_type",
  "entry_photo_captured_at",
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
  representingOrganisation: string | null;
  identityType: "nric" | "passport" | null;
  nric: string | null;
  passportNumber: string | null;
  vehicleNumber: string;
  additionalVehicleNumbers: string[] | null;
  otherVisitorNames: string[] | null;
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
  flaggedBy: string | null;
  flaggedAt: Date | null;
  entryPhotoBucket: string | null;
  entryPhotoPath: string | null;
  entryPhotoContentType: string | null;
  entryPhotoCapturedAt: Date | null;
  qrTokenJti: string | null;
  status: "pending" | "checked_in" | "checked_out" | "cancelled";
  createdBy: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  createdAt: Date;
  vehicleRecords?: VisitorVehicleReadRow[];
  entrySnapshotRecords?: VisitorEntrySnapshotReadRow[];
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

interface VisitorEntrySnapshotReadRow {
  id: string;
  visitorId: string;
  bucket: string;
  path: string;
  contentType: string;
  capturedAt: Date;
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
  metadata: Record<string, unknown> | null;
}

interface DetailChangeReadValue {
  from?: unknown;
  to?: unknown;
}

type DetailChangesReadValue = Record<string, DetailChangeReadValue>;

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

interface ReadVisitorsOptions {
  whereSql?: string;
  params?: unknown[];
  orderBySql?: string;
  limit?: number;
}

interface ParkingSnapshotCachePayload {
  counts: ParkingCounts;
  insideVisits: Visit[];
  logVisits: Visit[];
  allVisits: Visit[];
  occupancySeries: OccupancyPoint[];
  nowIso: string;
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

function normaliseLookupKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
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

function getVisitorPolicyExpiresAt(row: Pick<VisitorReadRow, "visitDate" | "createdAt">) {
  const visitDate = toVisitDateInput(row.visitDate);
  return visitDate ? getPreRegistrationTokenExpiresAt(visitDate) : getVisitTokenExpiresAt(row.createdAt);
}

function isVisitArrivalWindowExpired(row: VisitorReadRow, now: Date) {
  return getVisitorPolicyExpiresAt(row).getTime() <= now.getTime();
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

    const hasPendingVehicle = vehicleRecords.some((vehicle) => vehicle.status === "pending");
    const hasArrivedVehicle = vehicleRecords.some((vehicle) => vehicle.checkedIn || vehicle.status === "checked_out");
    if (hasPendingVehicle && hasArrivedVehicle) {
      return "partially_arrived";
    }

    if (hasPendingVehicle && isVisitArrivalWindowExpired(row, now)) {
      return "no_show";
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
    if (row.status === "pending" && isVisitArrivalWindowExpired(row, now)) {
      return "no_show";
    }
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

function withVehicleDisplayStatuses(vehicles: VisitVehicle[], visitStatus: Status, row: VisitorReadRow, now: Date): VisitVehicle[] {
  const expired = isVisitArrivalWindowExpired(row, now);
  return vehicles.map((vehicle) => {
    if (vehicle.status === "checked_in") {
      return {
        ...vehicle,
        displayStatus: visitStatus === "flagged" || visitStatus === "overstayed" ? visitStatus : "inside",
      };
    }
    if (vehicle.status === "checked_out") return { ...vehicle, displayStatus: "exited" };
    if (vehicle.status === "cancelled" || vehicle.status === "rejected") return { ...vehicle, displayStatus: "cancelled" };
    if (vehicle.status === "pending" && expired) return { ...vehicle, displayStatus: "no_show" };
    return { ...vehicle, displayStatus: "pending" };
  });
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

export function toPurposeNotes(remarks: string | null) {
  return remarks?.trim() || undefined;
}

function toVisit(row: VisitorReadRow, now: Date, overstayAllowedDays: number): Visit {
  const baseVehicles = toVisitVehicles(row);
  const status = toUiStatus(row, now, overstayAllowedDays);
  const vehicles = withVehicleDisplayStatuses(baseVehicles, status, row, now);
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
  const visitDate = toVisitDateInput(row.visitDate);
  const activeVehicle = activeVehicles[0];
  const entrySnapshots = toVisitEntrySnapshots(row);

  return {
    id: row.id,
    plate: row.vehicleNumber,
    additionalPlates: row.additionalVehicleNumbers ?? [],
    vehicles,
    activeVehicleNumber: activeVehicle?.plate,
    visitorName: row.name,
    visitorContact: row.phoneNumber,
    organisation: row.organisation ?? undefined,
    representingOrganisation: row.representingOrganisation ?? undefined,
    identityType: row.identityType ?? undefined,
    nric: row.nric ?? undefined,
    passportNumber: row.passportNumber ?? undefined,
    visitType: toVisitType(row.typeCode),
    purpose: toPurpose(row.purpose),
    purposeNotes: toPurposeNotes(row.remarks),
    visitDate: visitDate ?? undefined,
    visitTime: toVisitTimeInput(row.visitTime),
    visitorCount: row.visitorCount ?? undefined,
    otherVisitorNames: row.otherVisitorNames ?? undefined,
    hostStaffId: row.hostStaffId ?? undefined,
    hostDepartment: row.hostDepartment ?? undefined,
    flagReason: row.flagReason ?? undefined,
    flaggedBy: row.flaggedBy ?? undefined,
    flaggedAt: row.flaggedAt?.toISOString(),
    entryPhotoCapturedAt: row.entryPhotoCapturedAt?.toISOString(),
    entrySnapshots,
    entryTime: entryTime.toISOString(),
    entryGuardId: row.checkedInBy ?? row.createdBy ?? "system",
    exitTime: (lastVehicleExit ?? row.checkedOut)?.toISOString(),
    exitGuardId: checkedOutVehicles.find((vehicle) => vehicle.checkedOut === lastVehicleExit?.toISOString())?.checkedOutBy ?? row.checkedOutBy ?? undefined,
    status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVisitEntrySnapshots(row: VisitorReadRow): VisitEntrySnapshot[] | undefined {
  const records = row.entrySnapshotRecords ?? [];
  if (records.length > 0) {
    return records.map((snapshot) => ({
      id: snapshot.id,
      capturedAt: snapshot.capturedAt.toISOString(),
    }));
  }

  if (row.entryPhotoBucket && row.entryPhotoPath && row.entryPhotoCapturedAt) {
    return [
      {
        id: "legacy-entry-photo",
        capturedAt: row.entryPhotoCapturedAt.toISOString(),
      },
    ];
  }

  return undefined;
}

async function readVisitors(options: ReadVisitorsOptions = {}) {
  const ds = await getParkingDataSource();
  const columns = await getAvailableVisitorColumns(ds);
  const params = [...(options.params ?? [])];
  const whereSql = options.whereSql ? `WHERE ${options.whereSql}` : "";
  const orderBySql = options.orderBySql ?? `ORDER BY COALESCE(v."checked_in", v."created_at") DESC`;
  const limitSql = typeof options.limit === "number" && options.limit > 0
    ? `LIMIT $${params.push(options.limit)}`
    : "";
  const rows = (await ds.manager.query(
    `
      SELECT
        v."id",
        v."name",
        v."phone_number" AS "phoneNumber",
        v."organisation",
        ${optionalVisitorSelect(columns, "representing_organisation", "representingOrganisation", "NULL::text")},
        ${optionalVisitorSelect(columns, "identity_type", "identityType", "NULL::text")},
        ${optionalVisitorSelect(columns, "nric", "nric", "NULL::text")},
        ${optionalVisitorSelect(columns, "passport_number", "passportNumber", "NULL::text")},
        v."vehicle_number" AS "vehicleNumber",
        ${optionalVisitorSelect(columns, "additional_vehicle_numbers", "additionalVehicleNumbers", "ARRAY[]::text[]")},
        ${optionalVisitorSelect(columns, "other_visitor_names", "otherVisitorNames", "ARRAY[]::text[]")},
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
        v."flagged_by" AS "flaggedBy",
        v."flagged_at" AS "flaggedAt",
        ${optionalVisitorSelect(columns, "entry_photo_bucket", "entryPhotoBucket", "NULL::text")},
        ${optionalVisitorSelect(columns, "entry_photo_path", "entryPhotoPath", "NULL::text")},
        ${optionalVisitorSelect(columns, "entry_photo_content_type", "entryPhotoContentType", "NULL::text")},
        ${optionalVisitorSelect(columns, "entry_photo_captured_at", "entryPhotoCapturedAt", "NULL::timestamptz")},
        v."qr_token_jti" AS "qrTokenJti",
        v."status",
        v."created_by" AS "createdBy",
        v."checked_in_by" AS "checkedInBy",
        v."checked_out_by" AS "checkedOutBy",
        v."created_at" AS "createdAt"
      FROM "parking"."visitors" v
      INNER JOIN "parking"."visitor_types" vt ON vt."id" = v."type_id"
      ${whereSql}
      ${orderBySql}
      ${limitSql}
    `,
    params,
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

  let snapshotRows: VisitorEntrySnapshotReadRow[] = [];
  if (await tableExists(ds, "parking", "visitor_entry_snapshots")) {
    snapshotRows = (await ds.manager.query(
      `
        SELECT
          "id",
          "visitor_id" AS "visitorId",
          "bucket",
          "path",
          "content_type" AS "contentType",
          "captured_at" AS "capturedAt"
        FROM "parking"."visitor_entry_snapshots"
        WHERE "visitor_id" = ANY($1::uuid[])
        ORDER BY "captured_at" DESC, "created_at" DESC
      `,
      [rows.map((row) => row.id)],
    )) as VisitorEntrySnapshotReadRow[];
  }

  const snapshotsByVisitor = new Map<string, VisitorEntrySnapshotReadRow[]>();
  for (const snapshot of snapshotRows) {
    const current = snapshotsByVisitor.get(snapshot.visitorId) ?? [];
    current.push(snapshot);
    snapshotsByVisitor.set(snapshot.visitorId, current);
  }

  return rows.map((row) => ({
    ...row,
    vehicleRecords: byVisitor.get(row.id) ?? [],
    entrySnapshotRecords: snapshotsByVisitor.get(row.id) ?? [],
  }));
}

function buildCounts(visits: Visit[], todayEntriesOverride?: number) {
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
  const todayEntries = todayEntriesOverride ?? visits.filter((v) => {
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
      if (visit.status === "pending" || visit.status === "no_show" || visit.status === "partially_arrived") return false;
      const entry = new Date(visit.entryTime);
      const exit = visit.exitTime ? new Date(visit.exitTime) : null;
      return entry <= hourEnd && (!exit || exit >= hourStart);
    }).length;
    const entries = vehicleVisits.filter((visit) => {
      if (visit.status === "pending" || visit.status === "no_show" || visit.status === "partially_arrived") return false;
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
  if (vehicle.displayStatus) return vehicle.displayStatus;
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

function getMalaysiaDayBounds(now: Date) {
  const malaysiaTime = new Date(now.getTime() + MALAYSIA_UTC_OFFSET_MS);
  const startUtc = Date.UTC(
    malaysiaTime.getUTCFullYear(),
    malaysiaTime.getUTCMonth(),
    malaysiaTime.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const start = new Date(startUtc - MALAYSIA_UTC_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function getTodayEntryCount(now: Date) {
  const ds = await getParkingDataSource();
  const { start, end } = getMalaysiaDayBounds(now);
  const rows = (await ds.manager.query(
    `
      SELECT COUNT(*)::int AS "count"
      FROM "parking"."visitors"
      WHERE "created_at" >= $1
        AND "created_at" < $2
    `,
    [start, end],
  )) as Array<{ count: number }>;

  return Number(rows[0]?.count ?? 0);
}

async function readSnapshotVisitors(recentLimit = 200) {
  const ds = await getParkingDataSource();
  const idRows = (await ds.manager.query(
    `
      SELECT "id"
      FROM (
        SELECT
          v."id",
          COALESCE(v."checked_in", v."created_at") AS "sortAt",
          0 AS "priority"
        FROM "parking"."visitors" v
        WHERE v."status" IN ('pending', 'checked_in')
          OR v."flag_reason" IS NOT NULL

        UNION ALL

        (
          SELECT
            v."id",
            COALESCE(v."checked_out", v."checked_in", v."created_at") AS "sortAt",
            1 AS "priority"
          FROM "parking"."visitors" v
          ORDER BY COALESCE(v."checked_out", v."checked_in", v."created_at") DESC
          LIMIT $1
        )
      ) selected
      ORDER BY "priority" ASC, "sortAt" DESC
    `,
    [recentLimit],
  )) as Array<{ id: string }>;
  const ids = [...new Set(idRows.map((row) => row.id))];
  if (ids.length === 0) return [];

  return readVisitors({
    whereSql: `v."id" = ANY($1::uuid[])`,
    params: [ids],
    orderBySql: `ORDER BY COALESCE(v."checked_out", v."checked_in", v."created_at") DESC`,
  });
}

function toListSafeVisit(visit: Visit): Visit {
  const { nric: _nric, passportNumber: _passportNumber, ...safeVisit } = visit;
  return safeVisit;
}

function toSnapshotPayload(snapshot: ParkingSnapshot): ParkingSnapshotCachePayload {
  return {
    counts: snapshot.counts,
    insideVisits: snapshot.insideVisits.map(toListSafeVisit),
    logVisits: snapshot.logVisits.map(toListSafeVisit),
    allVisits: snapshot.allVisits.map(toListSafeVisit),
    occupancySeries: snapshot.occupancySeries,
    nowIso: snapshot.now.toISOString(),
  };
}

function fromSnapshotPayload(payload: ParkingSnapshotCachePayload): ParkingSnapshot {
  return {
    counts: payload.counts,
    insideVisits: payload.insideVisits,
    logVisits: payload.logVisits,
    allVisits: payload.allVisits,
    occupancySeries: payload.occupancySeries,
    now: new Date(payload.nowIso),
  };
}

async function buildParkingSnapshotPayload(): Promise<ParkingSnapshotCachePayload> {
  const now = new Date();
  const [rows, settings, todayEntries] = await Promise.all([
    readSnapshotVisitors(),
    getParkingSettings(),
    getTodayEntryCount(now),
  ]);
  const allVisits = rows.map((row) => toListSafeVisit(toVisit(row, now, settings.overstayAllowedDays)));
  const insideVisits = expandInsideVehicleVisits(allVisits);
  const logVisits = expandLogVehicleVisits(allVisits);

  return toSnapshotPayload({
    counts: buildCounts(allVisits, todayEntries),
    insideVisits,
    logVisits,
    allVisits,
    occupancySeries: buildOccupancySeries(allVisits, now),
    now,
  });
}

export async function getParkingSnapshot(): Promise<ParkingSnapshot> {
  const payload = await cacheJson(PARKING_CACHE_KEYS.snapshot, 5, buildParkingSnapshotPayload);
  return fromSnapshotPayload(payload);
}

export async function getVisitById(id: string) {
  const now = new Date();
  const [rows, settings] = await Promise.all([
    readVisitors({
      whereSql: `v."id" = $1`,
      params: [id],
      limit: 1,
    }),
    getParkingSettings(),
  ]);
  const row = rows[0];
  if (!row) return null;

  const visit = toVisit(row, now, settings.overstayAllowedDays);
  const host = await getHostByStaffId(row.hostStaffId);
  if (host) {
    visit.host = host;
    visit.hostDepartment = host.department;
  }
  if (row.qrTokenJti) {
    const visitDate = toVisitDateInput(row.visitDate);
    const expiresAt = getVisitorPolicyExpiresAt(row);
    visit.qrToken = await signVisitToken(row.id, row.qrTokenJti, row.createdAt, expiresAt);
    visit.qrTokenExpiresAt = expiresAt.toISOString();
  }
  if (row.entryPhotoBucket && row.entryPhotoPath) {
    visit.entryPhotoUrl = await createEntrySnapshotSignedUrl(row.entryPhotoBucket, row.entryPhotoPath) ?? undefined;
  }
  if (row.entrySnapshotRecords && row.entrySnapshotRecords.length > 0) {
    visit.entrySnapshots = await Promise.all(
      row.entrySnapshotRecords.map(async (snapshot) => ({
        id: snapshot.id,
        capturedAt: snapshot.capturedAt.toISOString(),
        url: await createEntrySnapshotSignedUrl(snapshot.bucket, snapshot.path) ?? undefined,
      })),
    );
    visit.entryPhotoUrl = visit.entrySnapshots[0]?.url ?? visit.entryPhotoUrl;
    visit.entryPhotoCapturedAt = visit.entrySnapshots[0]?.capturedAt ?? visit.entryPhotoCapturedAt;
  } else if (visit.entrySnapshots?.[0] && row.entryPhotoBucket && row.entryPhotoPath) {
    visit.entrySnapshots[0].url = visit.entryPhotoUrl;
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
        "scanned_at" AS "scannedAt",
        "metadata"
      FROM "parking"."visitor_scan_events"
      WHERE "visitor_id" = $1
      ORDER BY "scanned_at" ASC
    `,
    [visitId],
  )) as ScanEventReadRow[];

  return rows.map(toAuditEntry);
}

function toAuditEntry(row: ScanEventReadRow): AuditEntry {
  const activity = describeScanEvent(row);
  return {
    logId: row.id,
    timestampUtc: row.scannedAt.toISOString(),
    correlationId: row.id,
    actorUserId: row.guardId ?? "system",
    actorRole: "parking",
    actorLabel: row.guardId ? `Guard ${shortId(row.guardId)}` : "System",
    actionType:
      row.eventType === "pass_issued"
        ? "CREATE"
        : row.eventType === "pass_cancelled" || row.eventType === "details_updated"
          ? "UPDATE"
          : "SCAN",
    activityTitle: activity.title,
    activityDescription: activity.description,
    targetDoctype: "Parking Visit",
    targetRecordId: row.visitorId ?? undefined,
    result: row.eventType === "scan_rejected" ? "FAILURE" : "SUCCESS",
    failureReason: row.eventType === "scan_rejected" ? activity.description : undefined,
  };
}

function describeScanEvent(row: ScanEventReadRow) {
  const metadata = row.metadata ?? {};
  const reason = typeof metadata.reason === "string" ? metadata.reason : undefined;
  const vehicleNumber = typeof metadata.vehicleNumber === "string" ? metadata.vehicleNumber : undefined;

  if (row.eventType === "pass_issued") {
    return {
      title: "Visitor pass created",
      description: vehicleNumber ? `Pass issued for vehicle ${vehicleNumber}.` : "Visitor registration was created.",
    };
  }
  if (row.eventType === "check_in") {
    return {
      title: "Vehicle checked in",
      description: vehicleNumber ? `${vehicleNumber} entered the parking area.` : "Visitor vehicle entered the parking area.",
    };
  }
  if (row.eventType === "check_out") {
    return {
      title: "Vehicle checked out",
      description: vehicleNumber ? `${vehicleNumber} left the parking area.` : "Visitor vehicle left the parking area.",
    };
  }
  if (row.eventType === "scan_reviewed") {
    if (reason === "exit_vehicle_selection") {
      return {
        title: "Exit pass reviewed",
        description: "Guard reviewed the visitor pass before checkout.",
      };
    }
    return {
      title: "Arrival pass reviewed",
      description: "Guard reviewed the visitor pass before check-in.",
    };
  }
  if (row.eventType === "scan_rejected") {
    return {
      title: "Scan rejected",
      description: describeRejectedScan(reason),
    };
  }
  if (row.eventType === "pass_cancelled") {
    return {
      title: "Visitor pass cancelled",
      description: "Pending visitor pass was cancelled.",
    };
  }

  return describeDetailsUpdated(reason, metadata);
}

const DETAIL_FIELD_LABELS: Record<string, string> = {
  name: "Visitor name",
  phoneNumber: "Phone number",
  organisation: "Organisation",
  representingOrganisation: "Company represented",
  identityType: "Identity type",
  nric: "NRIC",
  passportNumber: "Passport number",
  vehicleNumber: "Vehicle number",
  additionalVehicleNumbers: "Linked vehicles",
  typeCode: "Visit type",
  typeId: "Visit type ID",
  purpose: "Purpose",
  visitTime: "Visit time",
  visitorCount: "Visitor count",
  remarks: "Remarks",
  hostStaffId: "Host staff ID",
  hostDepartment: "Host department",
  flagReason: "Review reason",
};

const DETAIL_FIELD_ORDER = Object.keys(DETAIL_FIELD_LABELS);
const SENSITIVE_DETAIL_FIELDS = new Set(["nric", "passportNumber"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDetailChanges(metadata: Record<string, unknown>): DetailChangesReadValue {
  if (!isRecord(metadata.changes)) return {};

  const changes: DetailChangesReadValue = {};
  for (const [field, change] of Object.entries(metadata.changes)) {
    if (!isRecord(change) || (!("from" in change) && !("to" in change))) continue;
    changes[field] = {
      from: change.from,
      to: change.to,
    };
  }

  return changes;
}

function sortedDetailChangeEntries(changes: DetailChangesReadValue) {
  return Object.entries(changes).sort(([left], [right]) => {
    const leftIndex = DETAIL_FIELD_ORDER.indexOf(left);
    const rightIndex = DETAIL_FIELD_ORDER.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }

    return left.localeCompare(right);
  });
}

function maskIdentityDetailValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "empty";

  const compact = text.replace(/[^A-Za-z0-9]/g, "");
  const ending = compact.slice(-4);
  return ending ? `[masked ending ${ending}]` : "[masked]";
}

function formatDetailValue(field: string, value: unknown) {
  if (SENSITIVE_DETAIL_FIELDS.has(field)) return maskIdentityDetailValue(value);
  if (value === null || value === undefined || value === "") return "empty";
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(", ") : "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);

  const text = String(value).trim();
  if (!text) return "empty";
  if (field === "identityType" || field === "typeCode") return labelize(text);
  if (field === "purpose" && (PURPOSES as readonly string[]).includes(text)) return purposeLabel(text as Purpose);

  return text;
}

function describeDetailChanges(metadata: Record<string, unknown>) {
  const changes = sortedDetailChangeEntries(getDetailChanges(metadata));
  if (changes.length === 0) return null;

  return `Changed ${changes
    .map(([field, change]) => {
      const label = DETAIL_FIELD_LABELS[field] ?? labelize(field);
      return `${label}: ${formatDetailValue(field, change.from)} -> ${formatDetailValue(field, change.to)}`;
    })
    .join("; ")}.`;
}

function metadataText(metadata: Record<string, unknown>, field: string) {
  const value = metadata[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function describeDetailsUpdated(reason: string | undefined, metadata: Record<string, unknown> = {}) {
  switch (reason) {
    case "arrival_manual_verification":
      return {
        title: "Visitor details updated",
        description: describeDetailChanges(metadata) ?? "Guard updated visitor details during arrival review.",
      };
    case "host_reassigned":
      return {
        title: "Host reassigned",
        description: describeDetailChanges(metadata) ?? "Guard changed the confirmed host for this registration.",
      };
    case "entry_snapshot_captured":
      return {
        title: "Entry snapshot added",
        description: "Guard captured a new entry snapshot for this registration.",
      };
    case "entry_snapshot_replaced":
      return {
        title: "Entry snapshot replaced",
        description: "Guard retook and replaced one entry snapshot.",
      };
    case "entry_snapshot_removed":
      return {
        title: "Entry snapshot removed",
        description: "Guard removed an entry snapshot from the registration and storage.",
      };
    case "visit_marked_for_review":
      return {
        title: "Marked for review",
        description: metadataText(metadata, "flagReason")
          ? `Admin marked this checked-in registration for guard follow-up: ${metadataText(metadata, "flagReason")}.`
          : "Admin marked this checked-in registration for guard follow-up.",
      };
    case "visit_review_reason_updated":
      return {
        title: "Review reason updated",
        description:
          metadataText(metadata, "previousReason") && metadataText(metadata, "flagReason")
            ? `Review reason changed from "${metadataText(metadata, "previousReason")}" to "${metadataText(metadata, "flagReason")}".`
            : "Admin updated the reason this registration needs attention.",
      };
    case "visit_review_flag_cleared":
      return {
        title: "Review flag cleared",
        description: metadataText(metadata, "previousReason")
          ? `Admin cleared review flag: ${metadataText(metadata, "previousReason")}.`
          : "Admin cleared the review marker from this registration.",
      };
    default:
      return {
        title: "Registration updated",
        description: "Visitor registration details were updated.",
      };
  }
}

function describeRejectedScan(reason: string | undefined) {
  switch (reason) {
    case "visitor_not_found":
      return "The QR pass did not match any visitor registration.";
    case "token_mismatch":
      return "The QR pass did not match this visitor record.";
    case "token_expired":
      return "The QR pass had expired.";
    case "pass_cancelled":
      return "The visitor pass had been cancelled.";
    case "already_checked_in":
      return "The visitor vehicle was already checked in.";
    case "already_checked_out":
      return "The visitor vehicle had already checked out.";
    case "no_vehicle_checked_in":
      return "No registered vehicle was currently checked in.";
    case "blacklisted_vehicle":
      return "Vehicle is blacklisted and entry was blocked.";
    case "manual_rejection":
      return "Guard rejected the visitor arrival after review.";
    default:
      return "The visitor pass scan was rejected.";
  }
}

function shortId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function getDemoEmployees() {
  return demoEmployees;
}

async function loadParkingVehicles(): Promise<Vehicle[]> {
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
  const staffLookupKeys = rows
    .filter((row) => row.ownerType === "staff")
    .map((row) => row.staffId ?? row.ownerEmail ?? row.ownerName);
  const staffByKey = await getHostsByStaffIds(staffLookupKeys);

  return rows.map((row) => {
    const staff = row.ownerType === "staff"
      ? staffByKey.get(normaliseLookupKey(row.staffId ?? row.ownerEmail ?? row.ownerName))
      : undefined;

    return {
      id: row.id,
      plate: row.plate,
      plateNormalised: row.plateNormalised,
      ownerName: staff?.name ?? row.ownerName ?? undefined,
      ownerContact: staff?.phone ?? row.ownerContact ?? undefined,
      ownerEmail: staff?.email ?? row.ownerEmail ?? undefined,
      ownerDepartment: row.ownerType === "staff" ? staff?.department : undefined,
      ownerType: toOwnerType(row.ownerType),
      staffId: row.ownerType === "visitor" ? undefined : staff?.staffId ?? row.staffId ?? undefined,
      notes: row.notes ?? undefined,
      blacklisted: row.blacklisted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getParkingVehicles(): Promise<Vehicle[]> {
  return cacheJson(PARKING_CACHE_KEYS.vehicles, 30, loadParkingVehicles);
}
