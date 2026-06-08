import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorManualVerificationEvents1718000000000 implements MigrationInterface {
  name = "AddVisitorManualVerificationEvents1718000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "parking"."visitor_scan_event_type"
      ADD VALUE IF NOT EXISTS 'scan_reviewed'
    `);
    await queryRunner.query(`
      ALTER TYPE "parking"."visitor_scan_event_type"
      ADD VALUE IF NOT EXISTS 'details_updated'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values in-place.
  }
}
