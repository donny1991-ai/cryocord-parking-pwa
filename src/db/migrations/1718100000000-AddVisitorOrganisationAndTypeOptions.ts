import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorOrganisationAndTypeOptions1718100000000 implements MigrationInterface {
  name = "AddVisitorOrganisationAndTypeOptions1718100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "organisation" varchar(160)
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visitor_types" ("code", "label")
      VALUES
        ('visitor', 'Visitor'),
        ('vendor', 'Vendor'),
        ('courier', 'Courier'),
        ('patient', 'Patient'),
        ('staff', 'Staff'),
        ('contractor', 'Contractor'),
        ('vip', 'VIP'),
        ('other', 'Other')
      ON CONFLICT ("code") DO UPDATE SET "label" = EXCLUDED."label"
    `);

    await queryRunner.query(`
      UPDATE "parking"."visitors" v
      SET "type_id" = next_type."id"
      FROM "parking"."visitor_types" old_type
      CROSS JOIN "parking"."visitor_types" next_type
      WHERE v."type_id" = old_type."id"
        AND (
          (old_type."code" = 'guest' AND next_type."code" = 'visitor')
          OR (old_type."code" = 'client' AND next_type."code" = 'patient')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "organisation"
    `);
  }
}
