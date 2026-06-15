import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVisitTypePurposeRules1719400000000 implements MigrationInterface {
  name = "CreateVisitTypePurposeRules1719400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visit_type_purpose_rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "visitor_type_code" varchar(32) NOT NULL UNIQUE REFERENCES "parking"."visitor_types" ("code") ON UPDATE CASCADE ON DELETE RESTRICT,
        "purpose_code" varchar(32) NOT NULL REFERENCES "parking"."visit_purposes" ("code") ON UPDATE CASCADE ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visit_type_purpose_rules" ("visitor_type_code", "purpose_code")
      VALUES ('courier', 'delivery')
      ON CONFLICT ("visitor_type_code") DO UPDATE SET "purpose_code" = EXCLUDED."purpose_code"
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_visit_type_purpose_rules_updated_at" ON "parking"."visit_type_purpose_rules"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_visit_type_purpose_rules_updated_at"
      BEFORE UPDATE ON "parking"."visit_type_purpose_rules"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_visit_type_purpose_rules_updated_at" ON "parking"."visit_type_purpose_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visit_type_purpose_rules"`);
  }
}
