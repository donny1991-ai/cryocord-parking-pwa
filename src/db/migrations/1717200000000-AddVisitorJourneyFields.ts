import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorJourneyFields1717200000000 implements MigrationInterface {
  name = "AddVisitorJourneyFields1717200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "purpose" varchar(32) NOT NULL DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS "host_staff_id" varchar(80),
      ADD COLUMN IF NOT EXISTS "host_department" varchar(120),
      ADD COLUMN IF NOT EXISTS "flag_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "flag_reason",
      DROP COLUMN IF EXISTS "host_department",
      DROP COLUMN IF EXISTS "host_staff_id",
      DROP COLUMN IF EXISTS "purpose"
    `);
  }
}
