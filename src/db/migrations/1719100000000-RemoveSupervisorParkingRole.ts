import type { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveSupervisorParkingRole1719100000000 implements MigrationInterface {
  name = "RemoveSupervisorParkingRole1719100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "parking"."users"
      SET "role" = 'guard'
      WHERE "role"::text = 'supervisor'
    `);

    await queryRunner.query(`ALTER TABLE "parking"."users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "parking"."parking_user_role" RENAME TO "parking_user_role_old"`);
    await queryRunner.query(`CREATE TYPE "parking"."parking_user_role" AS ENUM ('guard', 'admin')`);
    await queryRunner.query(`
      ALTER TABLE "parking"."users"
      ALTER COLUMN "role" TYPE "parking"."parking_user_role"
      USING "role"::text::"parking"."parking_user_role"
    `);
    await queryRunner.query(`ALTER TABLE "parking"."users" ALTER COLUMN "role" SET DEFAULT 'guard'`);
    await queryRunner.query(`DROP TYPE "parking"."parking_user_role_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parking"."users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "parking"."parking_user_role" RENAME TO "parking_user_role_new"`);
    await queryRunner.query(`CREATE TYPE "parking"."parking_user_role" AS ENUM ('guard', 'supervisor', 'admin')`);
    await queryRunner.query(`
      ALTER TABLE "parking"."users"
      ALTER COLUMN "role" TYPE "parking"."parking_user_role"
      USING "role"::text::"parking"."parking_user_role"
    `);
    await queryRunner.query(`ALTER TABLE "parking"."users" ALTER COLUMN "role" SET DEFAULT 'guard'`);
    await queryRunner.query(`DROP TYPE "parking"."parking_user_role_new"`);
  }
}
