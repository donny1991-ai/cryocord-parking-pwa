import type { DataSource } from "typeorm";

export interface FreshParkingDatabaseResult {
  deletedAuthUsers: number;
  migrationsRun: number;
}

export async function deleteParkingLinkedAuthUsers(dataSource: DataSource) {
  const hasParkingUsers = await dataSource.query(
    `SELECT to_regclass('parking.users') IS NOT NULL AS "exists"`,
  );

  if (!hasParkingUsers[0]?.exists) {
    return 0;
  }

  const result = await dataSource.query(`
    WITH deleted AS (
      DELETE FROM "auth"."users" au
      USING "parking"."users" pu
      WHERE au."id" = pu."id"
      RETURNING au."id"
    )
    SELECT count(*)::int AS "deletedAuthUsers" FROM deleted
  `);

  return Number(result[0]?.deletedAuthUsers ?? 0);
}

export async function dropParkingSchemaAndMigrationHistory(dataSource: DataSource) {
  await dataSource.transaction(async (manager) => {
    await manager.query(`DROP SCHEMA IF EXISTS "parking" CASCADE`);
    await manager.query(`DROP TABLE IF EXISTS "typeorm_migrations"`);
  });
}

export async function freshParkingDatabase(dataSource: DataSource): Promise<FreshParkingDatabaseResult> {
  const deletedAuthUsers = await deleteParkingLinkedAuthUsers(dataSource);
  await dropParkingSchemaAndMigrationHistory(dataSource);
  const migrations = await dataSource.runMigrations({ transaction: "all" });

  return {
    deletedAuthUsers,
    migrationsRun: migrations.length,
  };
}
