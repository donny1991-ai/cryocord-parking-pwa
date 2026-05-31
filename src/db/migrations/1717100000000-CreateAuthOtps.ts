import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthOtps1717100000000 implements MigrationInterface {
  name = "CreateAuthOtps1717100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "parking"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."auth_otps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "parking"."users" ("id") ON DELETE CASCADE,
        "email" varchar(320) NOT NULL,
        "otp_hash" varchar(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_auth_otps_attempts_non_negative" CHECK ("attempts" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_auth_otps_email_created_at"
        ON "parking"."auth_otps" ("email", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_auth_otps_user_created_at"
        ON "parking"."auth_otps" ("user_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_auth_otps_email_active"
        ON "parking"."auth_otps" ("email", "expires_at" DESC)
        WHERE "consumed_at" IS NULL
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_auth_otps_updated_at" ON "parking"."auth_otps"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_auth_otps_updated_at"
      BEFORE UPDATE ON "parking"."auth_otps"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_auth_otps_updated_at" ON "parking"."auth_otps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."auth_otps"`);
  }
}
