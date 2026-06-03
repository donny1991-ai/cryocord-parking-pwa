import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorCancelledStatus1717900000000 implements MigrationInterface {
  name = "AddVisitorCancelledStatus1717900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "parking"."visitor_status"
      ADD VALUE IF NOT EXISTS 'cancelled'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values in-place.
  }
}
