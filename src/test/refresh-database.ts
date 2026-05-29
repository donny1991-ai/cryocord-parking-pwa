import type { DataSource } from "typeorm";

/**
 * Laravel-style RefreshDatabase for the isolated integration database.
 * We only rebuild the application-owned parking schema; Supabase-managed
 * schemas such as auth/storage remain intact.
 */
export async function refreshParkingTestDatabase(dataSource: DataSource) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("refreshParkingTestDatabase can only run under NODE_ENV=test.");
  }

  await dataSource.query(`DROP SCHEMA IF EXISTS "parking" CASCADE`);
  await dataSource.query(`DROP TABLE IF EXISTS "typeorm_migrations"`);
  await dataSource.query(`DELETE FROM "auth"."users" WHERE "email" LIKE '%@parking.test'`);
  await dataSource.runMigrations({ transaction: "all" });
}
