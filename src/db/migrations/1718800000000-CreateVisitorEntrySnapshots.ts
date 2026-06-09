import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVisitorEntrySnapshots1718800000000 implements MigrationInterface {
  name = "CreateVisitorEntrySnapshots1718800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parking"."visitor_entry_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "visitor_id" uuid NOT NULL REFERENCES "parking"."visitors" ("id") ON DELETE CASCADE,
        "bucket" varchar(120) NOT NULL,
        "path" text NOT NULL,
        "content_type" varchar(80) NOT NULL,
        "captured_at" timestamptz NOT NULL DEFAULT now(),
        "captured_by" uuid REFERENCES "parking"."users" ("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_entry_snapshots_visitor_id_captured_at"
      ON "parking"."visitor_entry_snapshots" ("visitor_id", "captured_at" DESC)
    `);

    await queryRunner.query(`
      INSERT INTO "parking"."visitor_entry_snapshots" (
        "visitor_id",
        "bucket",
        "path",
        "content_type",
        "captured_at",
        "captured_by",
        "created_at"
      )
      SELECT
        "id",
        "entry_photo_bucket",
        "entry_photo_path",
        COALESCE("entry_photo_content_type", 'image/jpeg'),
        COALESCE("entry_photo_captured_at", "updated_at", now()),
        "entry_photo_captured_by",
        COALESCE("entry_photo_captured_at", "updated_at", now())
      FROM "parking"."visitors" v
      WHERE "entry_photo_bucket" IS NOT NULL
        AND "entry_photo_path" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "parking"."visitor_entry_snapshots" s
          WHERE s."visitor_id" = v."id"
            AND s."bucket" = v."entry_photo_bucket"
            AND s."path" = v."entry_photo_path"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "parking"."visitor_entry_snapshots"`);
  }
}
