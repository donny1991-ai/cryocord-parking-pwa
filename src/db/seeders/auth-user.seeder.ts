import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { ParkingUserSchema, type ParkingUserEntity, type ParkingUserRole } from "../entities";

export interface SeedAuthParkingUserInput {
  id?: string;
  email: string;
  name: string;
  phone?: string | null;
  role: ParkingUserRole;
  active?: boolean;
  isSuperAdmin?: boolean;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function seedAuthParkingUser(
  manager: EntityManager,
  input: SeedAuthParkingUserInput,
): Promise<ParkingUserEntity> {
  const email = normalizeEmail(input.email);
  const existingAuthUsers = await manager.query(
    `SELECT "id" FROM "auth"."users" WHERE lower("email") = $1 LIMIT 1`,
    [email],
  );
  const existingAuthUserId = existingAuthUsers[0]?.id;
  const id = input.id ?? existingAuthUserId ?? randomUUID();
  const active = input.active ?? true;
  const phone = input.phone ?? null;
  const isSuperAdmin = input.isSuperAdmin ?? input.role === "admin";

  if (!existingAuthUserId) {
    await manager.query(
      `
        INSERT INTO "auth"."users" (
          "id",
          "aud",
          "role",
          "email",
          "email_confirmed_at",
          "raw_app_meta_data",
          "raw_user_meta_data",
          "is_super_admin",
          "is_sso_user",
          "is_anonymous",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1,
          'authenticated',
          'authenticated',
          $2,
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', $3::text),
          $4::boolean,
          false,
          false,
          now(),
          now()
        )
      `,
      [id, email, input.name, isSuperAdmin],
    );
  }

  await manager.query(
    `
      INSERT INTO "parking"."users" (
        "id",
        "name",
        "phone",
        "role",
        "active",
        "created_at",
        "updated_at"
      )
      VALUES ($1, $2, $3, $4, $5, now(), now())
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "phone" = EXCLUDED."phone",
        "role" = EXCLUDED."role",
        "active" = EXCLUDED."active",
        "updated_at" = now()
    `,
    [id, input.name, phone, input.role, active],
  );

  return manager.findOneByOrFail(ParkingUserSchema, { id });
}

export async function seedStarterAdmin(manager: EntityManager) {
  return seedAuthParkingUser(manager, {
    email: process.env.PARKING_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? process.env.SMTP_USER ?? "aiprojects@cryocord.com.my",
    name: process.env.PARKING_ADMIN_NAME ?? process.env.ADMIN_NAME ?? "CryoCord Parking Admin",
    phone: process.env.PARKING_ADMIN_PHONE ?? null,
    role: "admin",
    active: true,
    isSuperAdmin: true,
  });
}
