import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVisitorAccessTables1716900000000 implements MigrationInterface {
  name = "CreateVisitorAccessTables1716900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "parking"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'visitor_status' AND n.nspname = 'parking') THEN
          CREATE TYPE "parking"."visitor_status" AS ENUM ('pending', 'checked_in', 'checked_out', 'cancelled');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'visitor_scan_event_type' AND n.nspname = 'parking') THEN
          CREATE TYPE "parking"."visitor_scan_event_type" AS ENUM ('pass_issued', 'check_in', 'check_out', 'scan_rejected');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitor_types" (
        "id" smallserial PRIMARY KEY,
        "code" varchar(32) NOT NULL UNIQUE,
        "label" varchar(80) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visitor_types" ("code", "label")
      VALUES
        ('guest', 'Guest'),
        ('vendor', 'Vendor'),
        ('client', 'Client'),
        ('staff', 'Staff')
      ON CONFLICT ("code") DO UPDATE SET "label" = EXCLUDED."label"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL,
        "phone_number" varchar(40) NOT NULL,
        "vehicle_number" varchar(32) NOT NULL,
        "vehicle_number_normalised" varchar(32) NOT NULL,
        "checked_in" timestamptz,
        "checked_out" timestamptz,
        "type_id" smallint NOT NULL REFERENCES "parking"."visitor_types" ("id") ON DELETE RESTRICT,
        "remarks" text,
        "qr_token_jti" varchar(80) UNIQUE,
        "status" "parking"."visitor_status" NOT NULL DEFAULT 'pending',
        "created_by" varchar(120),
        "checked_in_by" varchar(120),
        "checked_out_by" varchar(120),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_visitors_checkout_after_checkin"
          CHECK ("checked_out" IS NULL OR ("checked_in" IS NOT NULL AND "checked_out" >= "checked_in")),
        CONSTRAINT "chk_visitors_status_timestamps"
          CHECK (
            ("status" = 'pending' AND "checked_in" IS NULL AND "checked_out" IS NULL)
            OR ("status" = 'checked_in' AND "checked_in" IS NOT NULL AND "checked_out" IS NULL)
            OR ("status" = 'checked_out' AND "checked_in" IS NOT NULL AND "checked_out" IS NOT NULL)
            OR ("status" = 'cancelled')
          )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitor_scan_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "visitor_id" uuid REFERENCES "parking"."visitors" ("id") ON DELETE SET NULL,
        "event_type" "parking"."visitor_scan_event_type" NOT NULL,
        "guard_id" varchar(120),
        "scanned_at" timestamptz NOT NULL DEFAULT now(),
        "source" varchar(64) NOT NULL DEFAULT 'pwa',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitors_status_created_at"
        ON "parking"."visitors" ("status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitors_vehicle_normalised"
        ON "parking"."visitors" ("vehicle_number_normalised")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_visitors_one_active_vehicle"
        ON "parking"."visitors" ("vehicle_number_normalised")
        WHERE "status" = 'checked_in'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_scan_events_visitor_scanned_at"
        ON "parking"."visitor_scan_events" ("visitor_id", "scanned_at" DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "parking"."set_updated_at"()
      RETURNS trigger AS $$
      BEGIN
        NEW."updated_at" = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_visitors_updated_at" ON "parking"."visitors"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_visitors_updated_at"
      BEFORE UPDATE ON "parking"."visitors"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_visitors_updated_at" ON "parking"."visitors"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "parking"."set_updated_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitor_scan_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitors"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitor_types"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parking"."visitor_scan_event_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "parking"."visitor_status"`);
  }
}
