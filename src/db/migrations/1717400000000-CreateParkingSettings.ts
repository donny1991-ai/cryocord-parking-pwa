import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateParkingSettings1717400000000 implements MigrationInterface {
  name = "CreateParkingSettings1717400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."settings" (
        "key" varchar(80) PRIMARY KEY,
        "value" jsonb NOT NULL,
        "updated_by" uuid REFERENCES "parking"."users" ("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."settings" ("key", "value")
      VALUES
        ('auth_session_expires_hours', '{"hours":12}'::jsonb),
        ('overstay_allowed_days', '{"days":0}'::jsonb)
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_parking_settings_updated_at" ON "parking"."settings"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_parking_settings_updated_at"
      BEFORE UPDATE ON "parking"."settings"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_parking_settings_updated_at" ON "parking"."settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."settings"`);
  }
}
