import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorPassCancelledEvent1717800000000 implements MigrationInterface {
  name = "AddVisitorPassCancelledEvent1717800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "parking"."visitor_scan_event_type"
      ADD VALUE IF NOT EXISTS 'pass_cancelled'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values in-place.
  }
}
