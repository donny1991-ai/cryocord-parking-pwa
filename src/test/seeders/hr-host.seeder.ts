import type { EntityManager } from "typeorm";

export interface SeedHrHostInput {
  id?: number;
  empNo?: string;
  name?: string;
  email?: string;
  department?: string;
  phone?: string;
  extension?: string;
}

export async function seedHrHost(
  manager: EntityManager,
  input: SeedHrHostInput = {},
) {
  const id = input.id ?? 6908;
  const empNo = input.empNo ?? "CCSB0698";
  const name = input.name ?? "Host Confirm";
  const email = input.email ?? "host.confirm@cryocord.test";
  const department = input.department ?? "AI Projects Lab";
  const phone = input.phone ?? "0123456789";
  const extension = input.extension ?? "123";

  await manager.query(`
    CREATE TABLE IF NOT EXISTS "public"."departments" (
      "id" serial PRIMARY KEY,
      "slug" text UNIQUE,
      "name" text NOT NULL,
      "created_at" timestamptz DEFAULT now(),
      "updated_at" timestamptz DEFAULT now(),
      "deleted_at" timestamptz
    )
  `);
  await manager.query(`
    CREATE TABLE IF NOT EXISTS "public"."users" (
      "id" integer PRIMARY KEY,
      "email" text UNIQUE NOT NULL,
      "name" text NOT NULL,
      "nickname" text,
      "role" text NOT NULL DEFAULT 'employee',
      "department" text,
      "department_id" integer REFERENCES "public"."departments"("id"),
      "emp_no" text,
      "phone" text,
      "extension" text,
      "country" text DEFAULT 'Malaysia',
      "created_at" timestamptz DEFAULT now(),
      "updated_at" timestamptz DEFAULT now(),
      "deleted_at" timestamptz
    )
  `);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "nickname" text`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'employee'`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "department" text`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "public"."departments"("id")`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "emp_no" text`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "phone" text`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "extension" text`);
  await manager.query(`ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`);

  const departmentRows = await manager.query(
    `
      INSERT INTO "public"."departments" ("slug", "name")
      VALUES ($1, $2)
      ON CONFLICT ("slug") DO UPDATE SET
        "name" = EXCLUDED."name",
        "deleted_at" = NULL,
        "updated_at" = now()
      RETURNING "id", "name"
    `,
    [department.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), department],
  ) as Array<{ id: number; name: string }>;

  await manager.query(
    `
      INSERT INTO "public"."users" (
        "id",
        "email",
        "name",
        "role",
        "department",
        "department_id",
        "emp_no",
        "phone",
        "extension",
        "deleted_at"
      )
      VALUES ($1, $2, $3, 'employee', $4, $5, $6, $7, $8, NULL)
      ON CONFLICT ("id") DO UPDATE SET
        "email" = EXCLUDED."email",
        "name" = EXCLUDED."name",
        "department" = EXCLUDED."department",
        "department_id" = EXCLUDED."department_id",
        "emp_no" = EXCLUDED."emp_no",
        "phone" = EXCLUDED."phone",
        "extension" = EXCLUDED."extension",
        "deleted_at" = NULL,
        "updated_at" = now()
    `,
    [id, email, name, department, departmentRows[0].id, empNo, phone, extension],
  );

  return {
    id,
    staffId: empNo,
    name,
    email,
    department,
    phone,
    extension,
  };
}
