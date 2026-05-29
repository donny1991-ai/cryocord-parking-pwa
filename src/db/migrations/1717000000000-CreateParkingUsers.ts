import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateParkingUsers1717000000000 implements MigrationInterface {
  name = "CreateParkingUsers1717000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "parking"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'parking_user_role' AND n.nspname = 'parking') THEN
          CREATE TYPE "parking"."parking_user_role" AS ENUM ('guard', 'supervisor', 'admin');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."users" (
        "id" uuid PRIMARY KEY REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
        "name" varchar(160) NOT NULL,
        "phone" varchar(40),
        "role" "parking"."parking_user_role" NOT NULL DEFAULT 'guard',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_parking_users_role_active"
        ON "parking"."users" ("role", "active")
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_parking_users_updated_at" ON "parking"."users"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_parking_users_updated_at"
      BEFORE UPDATE ON "parking"."users"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_parking_users_updated_at" ON "parking"."users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parking"."parking_user_role"`);
  }
}
