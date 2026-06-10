import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorOtherVisitorNames1718900000000 implements MigrationInterface {
  name = "AddVisitorOtherVisitorNames1718900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "other_visitor_names" text[] NOT NULL DEFAULT ARRAY[]::text[]
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "other_visitor_names"
    `);
  }
}
