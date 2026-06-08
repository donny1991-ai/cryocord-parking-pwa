import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorAdditionalVehicleNumbers1718200000000 implements MigrationInterface {
  name = "AddVisitorAdditionalVehicleNumbers1718200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "additional_vehicle_numbers" text[] NOT NULL DEFAULT ARRAY[]::text[]
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'visitor_vehicle_status' AND n.nspname = 'parking') THEN
          CREATE TYPE "parking"."visitor_vehicle_status" AS ENUM ('pending', 'checked_in', 'checked_out', 'cancelled', 'rejected');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitor_vehicles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "visitor_id" uuid NOT NULL REFERENCES "parking"."visitors" ("id") ON DELETE CASCADE,
        "vehicle_number" varchar(32) NOT NULL,
        "vehicle_number_normalised" varchar(32) NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "status" "parking"."visitor_vehicle_status" NOT NULL DEFAULT 'pending',
        "checked_in" timestamptz,
        "checked_out" timestamptz,
        "checked_in_by" varchar(120),
        "checked_out_by" varchar(120),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_visitor_vehicles_checkout_after_checkin"
          CHECK ("checked_out" IS NULL OR ("checked_in" IS NOT NULL AND "checked_out" >= "checked_in")),
        CONSTRAINT "chk_visitor_vehicles_status_timestamps"
          CHECK (
            ("status" = 'pending' AND "checked_in" IS NULL AND "checked_out" IS NULL)
            OR ("status" = 'checked_in' AND "checked_in" IS NOT NULL AND "checked_out" IS NULL)
            OR ("status" = 'checked_out' AND "checked_in" IS NOT NULL AND "checked_out" IS NOT NULL)
            OR ("status" = 'cancelled')
            OR ("status" = 'rejected' AND "checked_in" IS NULL AND "checked_out" IS NULL)
          )
      )
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visitor_vehicles" (
        "visitor_id",
        "vehicle_number",
        "vehicle_number_normalised",
        "is_primary",
        "status",
        "checked_in",
        "checked_out",
        "checked_in_by",
        "checked_out_by",
        "created_at",
        "updated_at"
      )
      SELECT
        "id",
        "vehicle_number",
        "vehicle_number_normalised",
        true,
        CASE WHEN "status" = 'cancelled' THEN 'cancelled'::"parking"."visitor_vehicle_status" ELSE "status"::text::"parking"."visitor_vehicle_status" END,
        "checked_in",
        "checked_out",
        "checked_in_by",
        "checked_out_by",
        "created_at",
        "updated_at"
      FROM "parking"."visitors"
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visitor_vehicles" (
        "visitor_id",
        "vehicle_number",
        "vehicle_number_normalised",
        "is_primary",
        "status",
        "created_at",
        "updated_at"
      )
      SELECT
        v."id",
        plate,
        regexp_replace(upper(plate), '[^A-Z0-9]', '', 'g'),
        false,
        CASE WHEN v."status" = 'cancelled' THEN 'cancelled'::"parking"."visitor_vehicle_status" ELSE 'pending'::"parking"."visitor_vehicle_status" END,
        v."created_at",
        v."updated_at"
      FROM "parking"."visitors" v
      CROSS JOIN LATERAL unnest(v."additional_vehicle_numbers") AS plate
      WHERE regexp_replace(upper(plate), '[^A-Z0-9]', '', 'g') <> v."vehicle_number_normalised"
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_visitor_vehicles_registration_plate"
        ON "parking"."visitor_vehicles" ("visitor_id", "vehicle_number_normalised")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_visitor_vehicles_one_primary"
        ON "parking"."visitor_vehicles" ("visitor_id")
        WHERE "is_primary" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_visitor_vehicles_one_active_plate"
        ON "parking"."visitor_vehicles" ("vehicle_number_normalised")
        WHERE "status" = 'checked_in'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_vehicles_visitor_status"
        ON "parking"."visitor_vehicles" ("visitor_id", "status")
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_visitor_vehicles_updated_at" ON "parking"."visitor_vehicles"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_visitor_vehicles_updated_at"
      BEFORE UPDATE ON "parking"."visitor_vehicles"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_visitor_vehicles_updated_at" ON "parking"."visitor_vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitor_vehicles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parking"."visitor_vehicle_status"`);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "additional_vehicle_numbers"
    `);
  }
}
