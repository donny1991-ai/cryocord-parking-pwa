import type { MigrationInterface, QueryRunner } from "typeorm";

export class TightenVisitorPassportNumber1718600000000 implements MigrationInterface {
  name = "TightenVisitorPassportNumber1718600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        OR (
          "identity_type" = 'passport'
          AND "passport_number" IS NOT NULL
          AND "nric" IS NULL
          AND "passport_number" ~ '^[A-Z0-9]{5,20}$'
          AND "passport_number" ~ '[0-9]'
        )
      ) NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
