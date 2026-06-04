import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorVisitDate1717600000000 implements MigrationInterface {
  name = "AddVisitorVisitDate1717600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "visit_date" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "visit_date"
    `);
  }
}
