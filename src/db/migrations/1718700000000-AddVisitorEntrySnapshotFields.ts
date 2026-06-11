import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddVisitorEntrySnapshotFields1718700000000 implements MigrationInterface {
  name = "AddVisitorEntrySnapshotFields1718700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      ADD COLUMN IF NOT EXISTS "entry_photo_bucket" varchar(120),
      ADD COLUMN IF NOT EXISTS "entry_photo_path" text,
      ADD COLUMN IF NOT EXISTS "entry_photo_content_type" varchar(80),
      ADD COLUMN IF NOT EXISTS "entry_photo_captured_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "entry_photo_captured_by" uuid REFERENCES "parking"."users" ("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking"."visitors"
      DROP COLUMN IF EXISTS "entry_photo_captured_by",
      DROP COLUMN IF EXISTS "entry_photo_captured_at",
      DROP COLUMN IF EXISTS "entry_photo_content_type",
      DROP COLUMN IF EXISTS "entry_photo_path",
      DROP COLUMN IF EXISTS "entry_photo_bucket"
    `);
  }
}
