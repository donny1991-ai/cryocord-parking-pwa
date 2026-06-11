import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVisitorRequests1719000000000 implements MigrationInterface {
  name = "CreateVisitorRequests1719000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "parking"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitor_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL,
        "phone_number" varchar(40) NOT NULL,
        "organisation" varchar(160),
        "identity_type" varchar(16) NOT NULL,
        "nric" varchar(14),
        "passport_number" varchar(20),
        "vehicle_number" varchar(32) NOT NULL,
        "vehicle_number_normalised" varchar(32) NOT NULL,
        "purpose" varchar(32) NOT NULL DEFAULT 'meeting',
        "visitor_count" integer,
        "other_visitor_names" text[] NOT NULL DEFAULT ARRAY[]::text[],
        "requested_host_text" varchar(160) NOT NULL,
        "remarks" text,
        "status" varchar(24) NOT NULL DEFAULT 'submitted',
        "converted_visitor_id" uuid REFERENCES "parking"."visitors" ("id") ON DELETE SET NULL,
        "reviewed_by" uuid REFERENCES "parking"."users" ("id") ON DELETE SET NULL,
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_visitor_requests_status"
          CHECK ("status" IN ('submitted', 'converted', 'rejected')),
        CONSTRAINT "chk_visitor_requests_identity_type"
          CHECK ("identity_type" IN ('nric', 'passport')),
        CONSTRAINT "chk_visitor_requests_identity_document"
          CHECK (
            ("identity_type" = 'nric' AND "nric" IS NOT NULL AND "passport_number" IS NULL)
            OR ("identity_type" = 'passport' AND "passport_number" IS NOT NULL AND "nric" IS NULL)
          ),
        CONSTRAINT "chk_visitor_requests_visitor_count_positive"
          CHECK ("visitor_count" IS NULL OR "visitor_count" BETWEEN 1 AND 999)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_requests_status_created_at"
        ON "parking"."visitor_requests" ("status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_requests_vehicle_normalised"
        ON "parking"."visitor_requests" ("vehicle_number_normalised")
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_visitor_requests_updated_at" ON "parking"."visitor_requests"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_visitor_requests_updated_at"
      BEFORE UPDATE ON "parking"."visitor_requests"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_visitor_requests_updated_at" ON "parking"."visitor_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitor_requests"`);
  }
}
