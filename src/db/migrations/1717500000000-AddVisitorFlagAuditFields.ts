import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorFlagAuditFields1717500000000 implements MigrationInterface {
  name = "AddVisitorFlagAuditFields1717500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
        ADD COLUMN IF NOT EXISTS "flagged_by" uuid REFERENCES "parking"."users" ("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "flagged_at" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "parking"."visitors"
      SET "flagged_at" = COALESCE("updated_at", now())
      WHERE "flag_reason" IS NOT NULL
        AND "flagged_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
        DROP COLUMN IF EXISTS "flagged_at",
        DROP COLUMN IF EXISTS "flagged_by"
    `);
  }
}
