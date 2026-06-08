import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorVehicleRejectedStatus1718300000000 implements MigrationInterface {
  name = "AddVisitorVehicleRejectedStatus1718300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "parking"."visitor_vehicle_status"
      ADD VALUE IF NOT EXISTS 'rejected'
    `);

    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_vehicles"
      DROP CONSTRAINT IF EXISTS "chk_visitor_vehicles_status_timestamps"
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_vehicles"
      ADD CONSTRAINT "chk_visitor_vehicles_status_timestamps"
      CHECK (
        ("status"::text = 'pending' AND "checked_in" IS NULL AND "checked_out" IS NULL)
        OR ("status"::text = 'checked_in' AND "checked_in" IS NOT NULL AND "checked_out" IS NULL)
        OR ("status"::text = 'checked_out' AND "checked_in" IS NOT NULL AND "checked_out" IS NOT NULL)
        OR ("status"::text = 'cancelled')
        OR ("status"::text = 'rejected' AND "checked_in" IS NULL AND "checked_out" IS NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_vehicles"
      DROP CONSTRAINT IF EXISTS "chk_visitor_vehicles_status_timestamps"
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_vehicles"
      ADD CONSTRAINT "chk_visitor_vehicles_status_timestamps"
      CHECK (
        ("status"::text = 'pending' AND "checked_in" IS NULL AND "checked_out" IS NULL)
        OR ("status"::text = 'checked_in' AND "checked_in" IS NOT NULL AND "checked_out" IS NULL)
        OR ("status"::text = 'checked_out' AND "checked_in" IS NOT NULL AND "checked_out" IS NOT NULL)
        OR ("status"::text = 'cancelled')
      )
    `);
  }
}
