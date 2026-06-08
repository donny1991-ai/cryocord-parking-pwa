import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorOptionalVisitDetails1718400000000 implements MigrationInterface {
  name = "AddVisitorOptionalVisitDetails1718400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "visit_time" time,
      ADD COLUMN IF NOT EXISTS "visitor_count" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP CONSTRAINT IF EXISTS "chk_visitors_visitor_count_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD CONSTRAINT "chk_visitors_visitor_count_positive"
      CHECK ("visitor_count" IS NULL OR ("visitor_count" >= 1 AND "visitor_count" <= 999))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP CONSTRAINT IF EXISTS "chk_visitors_visitor_count_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "visitor_count",
      DROP COLUMN IF EXISTS "visit_time"
    `);
  }
}
