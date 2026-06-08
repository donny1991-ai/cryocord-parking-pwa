import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorIdentityDocument1718500000000 implements MigrationInterface {
  name = "AddVisitorIdentityDocument1718500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "identity_type" varchar(16),
      ADD COLUMN IF NOT EXISTS "nric" varchar(14),
      ADD COLUMN IF NOT EXISTS "passport_number" varchar(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP CONSTRAINT IF EXISTS "chk_visitors_identity_document"
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD CONSTRAINT "chk_visitors_identity_document"
      CHECK (
        ("identity_type" IS NULL AND "nric" IS NULL AND "passport_number" IS NULL)
        OR ("identity_type" = 'nric' AND "nric" IS NOT NULL AND "passport_number" IS NULL AND "nric" ~ '^[0-9]{6}-[0-9]{2}-[0-9]{4}$')
        OR ("identity_type" = 'passport' AND "passport_number" IS NOT NULL AND "nric" IS NULL AND "passport_number" ~ '^[A-Z0-9]{5,20}$')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parking"."visitors" DROP CONSTRAINT IF EXISTS "chk_visitors_identity_document"`);
    await queryRunner.query(`ALTER TABLE "parking"."visitors" DROP COLUMN IF EXISTS "passport_number"`);
    await queryRunner.query(`ALTER TABLE "parking"."visitors" DROP COLUMN IF EXISTS "nric"`);
    await queryRunner.query(`ALTER TABLE "parking"."visitors" DROP COLUMN IF EXISTS "identity_type"`);
  }
}
