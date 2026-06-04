import type { DataSource } from "typeorm";

export interface FreshParkingDatabaseResult {
  migrationsRun: number;
}

export async function dropParkingSchemaAndMigrationHistory(dataSource: DataSource) {
  await dataSource.transaction(async (manager) => {
    await manager.query(`DROP SCHEMA IF EXISTS "parking" CASCADE`);
    await manager.query(`DROP TABLE IF EXISTS "typeorm_migrations"`);
  });
}

export async function freshParkingDatabase(dataSource: DataSource): Promise<FreshParkingDatabaseResult> {
  await dropParkingSchemaAndMigrationHistory(dataSource);
  const migrations = await dataSource.runMigrations({ transaction: "all" });

  return {
    migrationsRun: migrations.length,
  };
}
