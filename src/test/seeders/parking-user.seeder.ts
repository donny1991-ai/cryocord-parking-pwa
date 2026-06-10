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
  const email = input.email ?? faker.internet.email({ provider: "parking.test" }).toLowerCase();
  const name = input.name ?? faker.person.fullName();
  const phone = input.phone === undefined ? faker.phone.number({ style: "international" }) : input.phone;
  const role = input.role ?? "guard";
  const active = input.active ?? true;

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
      ON CONFLICT ("id") DO UPDATE SET
        "aud" = EXCLUDED."aud",
        "role" = EXCLUDED."role",
        "email" = EXCLUDED."email",
        "updated_at" = now()
    `,
    [id, email],
  );

  await manager.upsert(
    ParkingUserSchema,
    {
      id,
      name,
      phone,
      role,
      active,
    },
    ["id"],
  );

  return manager.findOneByOrFail(ParkingUserSchema, { id });
}
