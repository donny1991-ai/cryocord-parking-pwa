import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVehicles1717300000000 implements MigrationInterface {
  name = "CreateVehicles1717300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."vehicles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "plate" varchar(32) NOT NULL,
        "plate_normalised" varchar(32) NOT NULL UNIQUE,
        "owner_name" varchar(160),
        "owner_contact" varchar(40),
        "owner_email" varchar(320),
        "owner_type" varchar(32),
        "staff_id" varchar(80),
        "notes" text,
        "blacklisted" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vehicles_blacklisted"
        ON "parking"."vehicles" ("blacklisted", "plate_normalised")
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trg_vehicles_updated_at" ON "parking"."vehicles"
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_vehicles_updated_at"
      BEFORE UPDATE ON "parking"."vehicles"
      FOR EACH ROW EXECUTE FUNCTION "parking"."set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_vehicles_updated_at" ON "parking"."vehicles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."vehicles"`);
  }
}
