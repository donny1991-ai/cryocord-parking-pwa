import type { AuditEntry, Employee, Vehicle, Visit } from "./types";
import { normalisePlate } from "./utils";

/**
 * Deterministic demo data. Times are anchored to MOCK_NOW so server and client
 * renders agree (no hydration drift) and durations stay sensible in the demo.
 * Swap this module for the Supabase-backed data layer (lib/supabase.ts) when
 * the self-hosted instance (Azure MY West) is live.
 */
export const MOCK_NOW = new Date("2026-05-26T14:40:00+08:00");

const minsAgo = (m: number) => new Date(MOCK_NOW.getTime() - m * 60000).toISOString();

export const MOCK_GUARD_ID = "guard-aziz-7731";

export const employees: Employee[] = [
  { staffId: "EMP-0142", name: "Dr. Lim Wei Sheng", department: "Laboratory" },
  { staffId: "EMP-0088", name: "Nurul Huda", department: "Sales Operations" },
  { staffId: "EMP-0211", name: "James Then", department: "Management" },
  { staffId: "EMP-0319", name: "Rajesh Kumar", department: "Finance" },
  { staffId: "EMP-0276", name: "Siti Aminah", department: "Human Resources" },
  { staffId: "EMP-0405", name: "Dr. Tan Mei Ling", department: "R&D" },
];

const mkVehicle = (
  plate: string,
  v: Partial<Vehicle> = {},
): Vehicle => ({
  id: `veh-${normalisePlate(plate)}`,
  plate,
  plateNormalised: normalisePlate(plate),
  blacklisted: false,
  createdAt: minsAgo(60 * 24 * 30),
  updatedAt: minsAgo(60 * 24),
  ...v,
});

export const vehicles: Vehicle[] = [
  mkVehicle("WA 18 K", {
    ownerName: "Dr. Lim Wei Sheng",
    ownerContact: "+60 12-345 6789",
    ownerEmail: "wslim@cryocord.com",
    ownerType: "staff",
    staffId: "EMP-0142",
  }),
  mkVehicle("WPT 332", {
    ownerName: "Nurul Huda",
    ownerType: "staff",
    staffId: "EMP-0088",
  }),
  mkVehicle("WXX 6666", {
    ownerName: "Unknown",
    ownerType: "visitor",
    blacklisted: true,
    notes: "Flagged by security 2026-04-30 — repeated tailgating at the boom gate.",
  }),
  mkVehicle("VIP 1", {
    ownerName: "Datuk Seri A. Rahman",
    ownerType: "vip",
    notes: "Board guest. Reserved bay B-01.",
  }),
];

export const visits: Visit[] = [
  {
    id: "v-1001",
    vehicleId: "veh-WA18K",
    plate: "WA 18 K",
    visitorName: "Dr. Lim Wei Sheng",
    visitorContact: "+60 12-345 6789",
    visitType: "staff",
    purpose: "meeting",
    hostStaffId: "EMP-0211",
    hostDepartment: "Management",
    entryTime: minsAgo(192),
    entryGuardId: MOCK_GUARD_ID,
    status: "inside",
    createdAt: minsAgo(192),
    qrToken: "demo.opaque.v-1001",
  },
  {
    id: "v-1002",
    plate: "JKL 4521",
    visitorName: "Marcus Chong",
    visitorContact: "+60 16-998 1020",
    visitType: "guest",
    purpose: "meeting",
    hostStaffId: "EMP-0088",
    hostDepartment: "Sales Operations",
    entryTime: minsAgo(45),
    entryGuardId: MOCK_GUARD_ID,
    status: "inside",
    createdAt: minsAgo(45),
    qrToken: "demo.opaque.v-1002",
  },
  {
    id: "v-1003",
    plate: "VBN 9087",
    visitorName: "GDex Courier",
    visitorContact: "+60 11-2233 4455",
    visitType: "vendor",
    purpose: "delivery",
    hostStaffId: "EMP-0276",
    hostDepartment: "Human Resources",
    entryTime: minsAgo(12),
    entryGuardId: MOCK_GUARD_ID,
    status: "inside",
    createdAt: minsAgo(12),
    qrToken: "demo.opaque.v-1003",
  },
  {
    id: "v-1004",
    plate: "WMQ 7781",
    visitorName: "Tan Family",
    visitorContact: "+60 13-444 5566",
    visitType: "client",
    purpose: "consultation",
    purposeNotes: "Cord blood consultation — appointment 15:00.",
    hostStaffId: "EMP-0142",
    hostDepartment: "Laboratory",
    entryTime: minsAgo(80),
    entryGuardId: MOCK_GUARD_ID,
    status: "inside",
    createdAt: minsAgo(80),
    qrToken: "demo.opaque.v-1004",
  },
  {
    id: "v-1005",
    plate: "BMT 77",
    visitorName: "Cool-Air HVAC Services",
    visitorContact: "+60 19-700 8800",
    visitType: "vendor",
    purpose: "maintenance",
    purposeNotes: "Chiller servicing — Lab cryo store.",
    hostStaffId: "EMP-0405",
    hostDepartment: "R&D",
    entryTime: minsAgo(330),
    entryGuardId: MOCK_GUARD_ID,
    status: "overstayed",
    createdAt: minsAgo(330),
    qrToken: "demo.opaque.v-1005",
  },
  {
    id: "v-1006",
    vehicleId: "veh-WXX6666",
    plate: "WXX 6666",
    visitorName: "Unverified",
    visitorContact: "—",
    visitType: "guest",
    purpose: "other",
    purposeNotes: "Plate matched blacklist on entry — escalated to duty manager.",
    entryTime: minsAgo(20),
    entryGuardId: MOCK_GUARD_ID,
    status: "flagged",
    createdAt: minsAgo(20),
  },
  {
    id: "v-1007",
    plate: "PMR 1188",
    visitorName: "Pathlab Sample Runner",
    visitorContact: "+60 17-321 9000",
    visitType: "vendor",
    purpose: "sample_delivery",
    hostStaffId: "EMP-0142",
    hostDepartment: "Laboratory",
    entryTime: minsAgo(120),
    entryGuardId: MOCK_GUARD_ID,
    status: "inside",
    createdAt: minsAgo(120),
    qrToken: "demo.opaque.v-1007",
  },
  {
    id: "v-1008",
    vehicleId: "veh-VIP1",
    plate: "VIP 1",
    visitorName: "Datuk Seri A. Rahman",
    visitorContact: "+60 12-000 0001",
    visitType: "client",
    purpose: "meeting",
    hostStaffId: "EMP-0211",
    hostDepartment: "Management",
    entryTime: minsAgo(360),
    entryGuardId: MOCK_GUARD_ID,
    exitTime: minsAgo(300),
    exitGuardId: MOCK_GUARD_ID,
    status: "exited",
    createdAt: minsAgo(360),
  },
  {
    id: "v-1009",
    plate: "JHQ 2210",
    visitorName: "BuildRight Contractors",
    visitorContact: "+60 14-556 7788",
    visitType: "vendor",
    purpose: "maintenance",
    hostStaffId: "EMP-0319",
    hostDepartment: "Finance",
    entryTime: minsAgo(480),
    entryGuardId: MOCK_GUARD_ID,
    exitTime: minsAgo(360),
    exitGuardId: MOCK_GUARD_ID,
    status: "exited",
    createdAt: minsAgo(480),
  },
  {
    id: "v-1010",
    plate: "WUV 2024",
    visitorName: "Office Supplies Co.",
    visitorContact: "+60 18-220 1133",
    visitType: "vendor",
    purpose: "pickup",
    hostStaffId: "EMP-0276",
    hostDepartment: "Human Resources",
    entryTime: minsAgo(540),
    entryGuardId: MOCK_GUARD_ID,
    exitTime: minsAgo(520),
    exitGuardId: MOCK_GUARD_ID,
    status: "exited",
    createdAt: minsAgo(540),
  },
];

// ---- Derived helpers -------------------------------------------------------

export const insideVisits = () =>
  visits.filter((v) => v.status === "inside" || v.status === "overstayed" || v.status === "flagged");

export const recentVisits = (limit = 6) =>
  [...visits].sort((a, b) => b.entryTime.localeCompare(a.entryTime)).slice(0, limit);

export const getVisit = (id: string) => visits.find((v) => v.id === id);

export const getVehicleByPlate = (plate: string) => {
  const n = normalisePlate(plate);
  return vehicles.find((v) => v.plateNormalised === n);
};

export const counts = () => {
  const inside = visits.filter((v) => v.status === "inside").length;
  const overstayed = visits.filter((v) => v.status === "overstayed").length;
  const flagged = visits.filter((v) => v.status === "flagged").length;
  const todayEntries = visits.length;
  return { inside, overstayed, flagged, todayEntries, currentlyInside: inside + overstayed + flagged };
};

/** Hourly entries for the occupancy chart (deterministic demo series). */
export const occupancySeries = () => {
  const labels = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
  const entries = [3, 7, 9, 6, 4, 5, 8];
  const inside = [3, 8, 12, 14, 11, 12, 15];
  return labels.map((hour, i) => ({ hour, entries: entries[i], inside: inside[i] }));
};

/** Demo audit trail for a visit detail screen. */
export const auditTrail = (visitId: string): AuditEntry[] => [
  {
    logId: "log-a1",
    timestampUtc: minsAgo(45),
    correlationId: "corr-9f2",
    actorUserId: MOCK_GUARD_ID,
    actorRole: "Parking Guard",
    actionType: "SCAN",
    targetDoctype: "Parking Visit",
    targetRecordId: visitId,
    result: "SUCCESS",
  },
  {
    logId: "log-a2",
    timestampUtc: minsAgo(44),
    correlationId: "corr-9f2",
    actorUserId: MOCK_GUARD_ID,
    actorRole: "Parking Guard",
    actionType: "CREATE",
    targetDoctype: "Parking Visit",
    targetRecordId: visitId,
    result: "SUCCESS",
  },
];
