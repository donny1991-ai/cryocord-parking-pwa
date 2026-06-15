import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateParkingAdminOptions1719300000000 implements MigrationInterface {
  name = "CreateParkingAdminOptions1719300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "parking"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."companies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(160) NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visit_purposes" (
        "id" smallserial PRIMARY KEY,
        "code" varchar(32) NOT NULL UNIQUE,
        "label" varchar(80) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."companies" ("name")
      VALUES ('CryoCord'), ('Cytopeutic')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visit_purposes" ("code", "label")
      VALUES
        ('meeting', 'Meeting'),
        ('sample_delivery', 'Sample Delivery'),
        ('consultation', 'Consultation'),
        ('maintenance', 'Maintenance'),
        ('delivery', 'Delivery'),
        ('pickup', 'Pickup'),
        ('other', 'Other')
      ON CONFLICT ("code") DO UPDATE SET "label" = EXCLUDED."label"
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_companies_updated_at" ON "parking"."companies"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_companies_updated_at"
      BEFORE UPDATE ON "parking"."companies"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_visit_purposes_updated_at" ON "parking"."visit_purposes"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_visit_purposes_updated_at"
      BEFORE UPDATE ON "parking"."visit_purposes"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_visit_purposes_updated_at" ON "parking"."visit_purposes"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_companies_updated_at" ON "parking"."companies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visit_purposes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."companies"`);
  }
}
