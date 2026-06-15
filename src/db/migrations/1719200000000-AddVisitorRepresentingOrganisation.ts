import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorRepresentingOrganisation1719200000000 implements MigrationInterface {
  name = "AddVisitorRepresentingOrganisation1719200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "representing_organisation" varchar(160)
    `);

    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_requests"
      ADD COLUMN IF NOT EXISTS "representing_organisation" varchar(160)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitor_requests"
      DROP COLUMN IF EXISTS "representing_organisation"
    `);

    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "representing_organisation"
    `);
  }
}
