import { faker } from "@faker-js/faker";
import type { EntityManager } from "typeorm";
import { ParkingUserSchema, type ParkingUserEntity, type ParkingUserRole } from "@/db/entities";

export interface SeedParkingUserInput {
  id?: string;
  email?: string;
  name?: string;
  phone?: string | null;
  role?: ParkingUserRole;
  active?: boolean;
}

export async function seedParkingUser(
  manager: EntityManager,
  input: SeedParkingUserInput = {},
): Promise<ParkingUserEntity> {
  const id = input.id ?? faker.string.uuid();
  const email = input.email ?? `parking-user-${id}@parking.test`;
  const name = input.name ?? faker.person.fullName();
  const phone = input.phone === undefined ? faker.phone.number({ style: "international" }) : input.phone;
  const role = input.role ?? "guard";
  const active = input.active ?? true;
  const existingAuthUsers = await manager.query(
    `SELECT "id" FROM "auth"."users" WHERE "id" = $1 LIMIT 1`,
    [id],
  );

  if (existingAuthUsers.length > 0) {
    await manager.query(
      `
        UPDATE "auth"."users"
        SET
          "aud" = 'authenticated',
          "role" = 'authenticated',
          "email" = $2,
          "updated_at" = now()
        WHERE "id" = $1
      `,
      [id, email],
    );
  } else {
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
          '{}'::jsonb,
          false,
          false,
          false,
          now(),
          now()
        )
      `,
      [id, email],
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
    [id, name, phone, role, active],
  );

  return manager.findOneByOrFail(ParkingUserSchema, { id });
}
