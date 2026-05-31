import type { EntityManager } from "typeorm";
import { normalisePlate } from "@/lib/utils";
import { seedAuthParkingUser } from "./auth-user.seeder";

const DEMO_GUARD_ID = "00000000-0000-4000-8000-000000000101";

const demoVehicles = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    plate: "WA 18 K",
    ownerName: "Dr. Lim Wei Sheng",
    ownerContact: "+60 12-345 6789",
    ownerEmail: "wslim@cryocord.com",
    ownerType: "staff",
    staffId: "EMP-0142",
    blacklisted: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    plate: "WPT 332",
    ownerName: "Nurul Huda",
    ownerType: "staff",
    staffId: "EMP-0088",
    blacklisted: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000203",
    plate: "WXX 6666",
    ownerName: "Unknown",
    ownerType: "visitor",
    notes: "Repeated tailgating at the boom gate.",
    blacklisted: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000204",
    plate: "VIP 1",
    ownerName: "Datuk Seri A. Rahman",
    ownerType: "vip",
    notes: "Board guest. Reserved bay B-01.",
    blacklisted: false,
  },
];

interface DemoVisit {
  id: string;
  name: string;
  phone: string;
  plate: string;
  typeCode: "guest" | "vendor" | "client" | "staff";
  purpose: string;
  remarks?: string;
  hostStaffId?: string;
  hostDepartment?: string;
  flagReason?: string;
  checkedInMinutesAgo: number;
  checkedOutMinutesAgo?: number;
}

const demoVisits: DemoVisit[] = [
  {
    id: "00000000-0000-4000-8000-000000001001",
    plate: "WA 18 K",
    name: "Dr. Lim Wei Sheng",
    phone: "+60 12-345 6789",
    typeCode: "staff",
    purpose: "meeting",
    hostStaffId: "EMP-0211",
    hostDepartment: "Management",
    checkedInMinutesAgo: 192,
  },
  {
    id: "00000000-0000-4000-8000-000000001002",
    plate: "JKL 4521",
    name: "Marcus Chong",
    phone: "+60 16-998 1020",
    typeCode: "guest",
    purpose: "meeting",
    hostStaffId: "EMP-0088",
    hostDepartment: "Sales Operations",
    checkedInMinutesAgo: 45,
  },
  {
    id: "00000000-0000-4000-8000-000000001003",
    plate: "VBN 9087",
    name: "GDex Courier",
    phone: "+60 11-2233 4455",
    typeCode: "vendor",
    purpose: "delivery",
    hostDepartment: "Human Resources",
    checkedInMinutesAgo: 12,
  },
  {
    id: "00000000-0000-4000-8000-000000001004",
    plate: "WMQ 7781",
    name: "Tan Family",
    phone: "+60 13-444 5566",
    typeCode: "client",
    purpose: "consultation",
    remarks: "Cord blood consultation appointment.",
    hostStaffId: "EMP-0142",
    hostDepartment: "Laboratory",
    checkedInMinutesAgo: 80,
  },
  {
    id: "00000000-0000-4000-8000-000000001005",
    plate: "BMT 77",
    name: "Cool-Air HVAC Services",
    phone: "+60 19-700 8800",
    typeCode: "vendor",
    purpose: "maintenance",
    remarks: "Chiller servicing at Lab cryo store.",
    hostStaffId: "EMP-0405",
    hostDepartment: "R&D",
    checkedInMinutesAgo: 330,
  },
  {
    id: "00000000-0000-4000-8000-000000001006",
    plate: "WXX 6666",
    name: "Unverified",
    phone: "+60 10-000 0000",
    typeCode: "guest",
    purpose: "other",
    remarks: "Escalated to duty manager.",
    flagReason: "Plate matched the blacklist on entry.",
    checkedInMinutesAgo: 20,
  },
  {
    id: "00000000-0000-4000-8000-000000001007",
    plate: "PMR 1188",
    name: "Pathlab Sample Runner",
    phone: "+60 17-321 9000",
    typeCode: "vendor",
    purpose: "sample_delivery",
    hostStaffId: "EMP-0142",
    hostDepartment: "Laboratory",
    checkedInMinutesAgo: 120,
  },
  {
    id: "00000000-0000-4000-8000-000000001008",
    plate: "VIP 1",
    name: "Datuk Seri A. Rahman",
    phone: "+60 12-000 0001",
    typeCode: "client",
    purpose: "meeting",
    hostStaffId: "EMP-0211",
    hostDepartment: "Management",
    checkedInMinutesAgo: 360,
    checkedOutMinutesAgo: 300,
  },
  {
    id: "00000000-0000-4000-8000-000000001009",
    plate: "JHQ 2210",
    name: "BuildRight Contractors",
    phone: "+60 14-556 7788",
    typeCode: "vendor",
    purpose: "maintenance",
    hostStaffId: "EMP-0319",
    hostDepartment: "Finance",
    checkedInMinutesAgo: 480,
    checkedOutMinutesAgo: 360,
  },
  {
    id: "00000000-0000-4000-8000-000000001010",
    plate: "WUV 2024",
    name: "Office Supplies Co.",
    phone: "+60 18-220 1133",
    typeCode: "vendor",
    purpose: "pickup",
    hostStaffId: "EMP-0276",
    hostDepartment: "Human Resources",
    checkedInMinutesAgo: 540,
    checkedOutMinutesAgo: 520,
  },
];

function demoEventId(visitId: string, stream: "issued" | "in" | "out") {
  const suffix = visitId.slice(-4);
  const streamPart = stream === "issued" ? "8100" : stream === "in" ? "8200" : "8300";
  return `00000000-0000-4000-${streamPart}-00000000${suffix}`;
}

export async function seedDemoJourney(manager: EntityManager) {
  const guard = await seedAuthParkingUser(manager, {
    id: DEMO_GUARD_ID,
    email: "aziz.guard@parking.test",
    name: "Aziz Rahman",
    role: "guard",
  });

  for (const vehicle of demoVehicles) {
    await manager.query(
      `
        INSERT INTO "parking"."vehicles" (
          "id",
          "plate",
          "plate_normalised",
          "owner_name",
          "owner_contact",
          "owner_email",
          "owner_type",
          "staff_id",
          "notes",
          "blacklisted",
          "created_at",
          "updated_at"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
        ON CONFLICT ("plate_normalised") DO UPDATE SET
          "plate" = EXCLUDED."plate",
          "owner_name" = EXCLUDED."owner_name",
          "owner_contact" = EXCLUDED."owner_contact",
          "owner_email" = EXCLUDED."owner_email",
          "owner_type" = EXCLUDED."owner_type",
          "staff_id" = EXCLUDED."staff_id",
          "notes" = EXCLUDED."notes",
          "blacklisted" = EXCLUDED."blacklisted",
          "updated_at" = now()
      `,
      [
        vehicle.id,
        vehicle.plate,
        normalisePlate(vehicle.plate),
        vehicle.ownerName ?? null,
        "ownerContact" in vehicle ? vehicle.ownerContact : null,
        "ownerEmail" in vehicle ? vehicle.ownerEmail : null,
        vehicle.ownerType ?? null,
        "staffId" in vehicle ? vehicle.staffId : null,
        "notes" in vehicle ? vehicle.notes : null,
        vehicle.blacklisted,
      ],
    );
  }

  for (const visit of demoVisits) {
    const rows = await manager.query(`SELECT "id" FROM "parking"."visitor_types" WHERE "code" = $1`, [
      visit.typeCode,
    ]);
    const typeId = rows[0]?.id;
    if (!typeId) {
      throw new Error(`Missing visitor type: ${visit.typeCode}`);
    }

    const checkedIn = `now() - interval '${visit.checkedInMinutesAgo} minutes'`;
    const checkedOut = visit.checkedOutMinutesAgo ? `now() - interval '${visit.checkedOutMinutesAgo} minutes'` : "NULL";
    const status = visit.checkedOutMinutesAgo ? "checked_out" : "checked_in";

    await manager.query(
      `
        INSERT INTO "parking"."visitors" (
          "id",
          "name",
          "phone_number",
          "vehicle_number",
          "vehicle_number_normalised",
          "checked_in",
          "checked_out",
          "type_id",
          "remarks",
          "purpose",
          "host_staff_id",
          "host_department",
          "flag_reason",
          "status",
          "created_by",
          "checked_in_by",
          "checked_out_by",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1, $2, $3, $4, $5, ${checkedIn}, ${checkedOut}, $6, $7, $8, $9, $10, $11, $12,
          $13, $13, ${visit.checkedOutMinutesAgo ? "$13" : "NULL"}, ${checkedIn}, now()
        )
        ON CONFLICT ("id") DO UPDATE SET
          "name" = EXCLUDED."name",
          "phone_number" = EXCLUDED."phone_number",
          "vehicle_number" = EXCLUDED."vehicle_number",
          "vehicle_number_normalised" = EXCLUDED."vehicle_number_normalised",
          "checked_in" = EXCLUDED."checked_in",
          "checked_out" = EXCLUDED."checked_out",
          "type_id" = EXCLUDED."type_id",
          "remarks" = EXCLUDED."remarks",
          "purpose" = EXCLUDED."purpose",
          "host_staff_id" = EXCLUDED."host_staff_id",
          "host_department" = EXCLUDED."host_department",
          "flag_reason" = EXCLUDED."flag_reason",
          "status" = EXCLUDED."status",
          "created_by" = EXCLUDED."created_by",
          "checked_in_by" = EXCLUDED."checked_in_by",
          "checked_out_by" = EXCLUDED."checked_out_by",
          "updated_at" = now()
      `,
      [
        visit.id,
        visit.name,
        visit.phone,
        visit.plate,
        normalisePlate(visit.plate),
        typeId,
        visit.remarks ?? null,
        visit.purpose,
        visit.hostStaffId ?? null,
        visit.hostDepartment ?? null,
        visit.flagReason ?? null,
        status,
        guard.id,
      ],
    );

    await manager.query(
      `
        INSERT INTO "parking"."visitor_scan_events" ("id", "visitor_id", "event_type", "guard_id", "scanned_at", "metadata")
        VALUES
          ($1, $2, 'pass_issued', $3, now() - interval '${visit.checkedInMinutesAgo + 5} minutes', '{}'::jsonb),
          ($4, $2, 'check_in', $3, now() - interval '${visit.checkedInMinutesAgo} minutes', '{}'::jsonb)
        ON CONFLICT DO NOTHING
      `,
      [demoEventId(visit.id, "issued"), visit.id, guard.id, demoEventId(visit.id, "in")],
    );

    if (visit.checkedOutMinutesAgo) {
      await manager.query(
        `
          INSERT INTO "parking"."visitor_scan_events" ("id", "visitor_id", "event_type", "guard_id", "scanned_at", "metadata")
          VALUES ($1, $2, 'check_out', $3, now() - interval '${visit.checkedOutMinutesAgo} minutes', '{}'::jsonb)
          ON CONFLICT DO NOTHING
        `,
        [demoEventId(visit.id, "out"), visit.id, guard.id],
      );
    }
  }

  return { guard, visitsSeeded: demoVisits.length, vehiclesSeeded: demoVehicles.length };
}
